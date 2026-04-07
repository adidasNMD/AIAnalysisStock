package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

// Task represents the QueueTask defined in TS schemas
type Task struct {
	ID        string `json:"id"`
	Query     string `json:"query"`
	Depth     string `json:"depth"`
	Status    string `json:"status"`
	Source    string `json:"source"`
	CreatedAt int64  `json:"createdAt"`
}

var db *sql.DB

func initDB() {
	var err error
	// Match the path where Node.js keeps openclaw.db
	dbPath := "../../data/openclaw.db"
	db, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open SQLite database: %v", err)
	}

	// Ping database to verify connection
	if err = db.Ping(); err != nil {
		log.Fatalf("Failed to ping SQLite database: %v", err)
	}
	log.Println("✅ [Golang] Successfully connected to SQLite Database")
}

// Background poller that checks the SQLite queue for pending tasks
func taskScheduler() {
	for {
		time.Sleep(1000 * time.Millisecond)

		// Fetch the oldest pending task
		var task Task
		query := `SELECT id, query, depth, status, source, createdAt FROM tasks WHERE status = 'pending' ORDER BY priority DESC, createdAt ASC LIMIT 1`
		err := db.QueryRow(query).Scan(&task.ID, &task.Query, &task.Depth, &task.Status, &task.Source, &task.CreatedAt)
		
		if err == sql.ErrNoRows {
			continue // No tasks pending
		} else if err != nil {
			log.Printf("❌ Database error scanning tasks: %v", err)
			continue
		}

		log.Printf("🎯 [Gateway Scheduler] Detected pending task: %s, executing via Python AI Worker...", task.Query)

		// 1. Mark task as running
		_, err = db.Exec("UPDATE tasks SET status = 'running', startedAt = ? WHERE id = ?", time.Now().UnixMilli(), task.ID)
		if err != nil {
			log.Printf("❌ Failed to update task status: %v", err)
			continue
		}

		// 2. Dispatch to Python Microservice
		payload := map[string]string{
			"query":     task.Query,
			"depth":     task.Depth,
			"missionId": task.ID,
		}
		jsonStr, _ := json.Marshal(payload)
		
		resp, err := http.Post("http://localhost:8000/api/v1/mission/execute", "application/json", bytes.NewBuffer(jsonStr))
		if err != nil || resp.StatusCode != 200 {
			log.Printf("❌ Python Worker Error: %v", err)
			// Revert to failed
			db.Exec("UPDATE tasks SET status = 'failed', completedAt = ? WHERE id = ?", time.Now().UnixMilli(), task.ID)
		}
		resp.Body.Close()
	}
}

// CORS Middleware
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func main() {
	fmt.Println("🚀 Initializing OpenClaw V4 Golang High-Frequency Gateway...")

	initDB()

	// Launch Goroutines for high-frequency operations without blocking HTTP
	go taskScheduler()

	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()
	router.Use(CORSMiddleware())

	// ---- Proxy SSE to Python ----
	// This magically streams the AI Python responses directly to the frontend
	// over a highly concurrent Go reverse proxy!
	pythonServerURL, _ := url.Parse("http://localhost:8000")
	proxy := httputil.NewSingleHostReverseProxy(pythonServerURL)

	router.GET("/api/stream", func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	})

	// ---- Enqueue Task Equivalent ----
	router.POST("/api/trigger", func(c *gin.Context) {
		var req struct {
			Query   string `json:"query"`
			Depth   string `json:"depth"`
			Source  string `json:"source"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid payload"})
			return
		}
		
		// Insert into SQLite to let the Go Goroutine scheduler pick it up!
		id := fmt.Sprintf("%d_gogateway", time.Now().UnixMilli())
		_, err := db.Exec(`INSERT INTO tasks (id, query, depth, priority, source, status, createdAt) 
			VALUES (?, ?, ?, ?, ?, 'pending', ?)`, 
			id, req.Query, req.Depth, 0, req.Source, time.Now().UnixMilli())

		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		
		c.JSON(200, gin.H{"success": true, "taskId": id})
	})

	router.GET("/api/queue", func(c *gin.Context) {
		rows, err := db.Query("SELECT id, query, depth, status, source, createdAt FROM tasks ORDER BY createdAt DESC LIMIT 10")
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var tasks []Task
		for rows.Next() {
			var t Task
			rows.Scan(&t.ID, &t.Query, &t.Depth, &t.Status, &t.Source, &t.CreatedAt)
			tasks = append(tasks, t)
		}
		
		c.JSON(200, gin.H{
			"summary": fmt.Sprintf("%d missions active", len(tasks)),
			"tasks": tasks,
		})
	})

	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "Golang Engine Online", "isDegraded": false})
	})

	// Run on 4000. Wait, if we want to seamlessly replace Node.js, we should use 3000!
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000" // We'll test on 4000 first to avoid collisions with active Node instance
	}
	
	log.Printf("🌐 Starting Golang Gateway API on port %s", port)
	router.Run(":" + port)
}
