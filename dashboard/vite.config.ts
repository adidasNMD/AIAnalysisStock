import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const reactVendorPackages = new Set([
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
])

const markdownVendorPackages = new Set([
  'bail',
  'character-entities',
  'character-entities-html4',
  'character-entities-legacy',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'devlop',
  'hast-util-to-jsx-runtime',
  'hast-util-whitespace',
  'html-url-attributes',
  'mdast-util-from-markdown',
  'mdast-util-to-hast',
  'mdast-util-to-string',
  'micromark',
  'property-information',
  'react-markdown',
  'remark-parse',
  'remark-rehype',
  'space-separated-tokens',
  'trim-lines',
  'trough',
  'unified',
  'vfile',
  'vfile-message',
  'zwitch',
])

const markdownVendorPrefixes = [
  'ccount',
  'hast-util-',
  'mdast-util-',
  'micromark-',
  'micromark-util-',
  'unist-util-',
]

function packageNameFromId(id: string) {
  const marker = '/node_modules/'
  const index = id.lastIndexOf(marker)
  if (index === -1) return null
  const parts = id.slice(index + marker.length).split('/')
  if (!parts[0]) return null
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

type CodeSplittingGroup = {
  name: string
  priority?: number
  test: (id: string) => boolean
}

type RolldownOutputOptions = {
  strictExecutionOrder?: boolean
  codeSplitting?: {
    includeDependenciesRecursively?: boolean
    groups: CodeSplittingGroup[]
  }
}

const rolldownOutputOptions: RolldownOutputOptions = {
  strictExecutionOrder: true,
  codeSplitting: {
    includeDependenciesRecursively: false,
    groups: [
      {
        name: 'react-vendor',
        priority: 100,
        test: (id) => {
          const packageName = packageNameFromId(id)
          return packageName !== null && reactVendorPackages.has(packageName)
        },
      },
      {
        name: 'markdown-vendor',
        priority: 90,
        test: (id) => {
          const packageName = packageNameFromId(id)
          return packageName !== null && (
            markdownVendorPackages.has(packageName) ||
            markdownVendorPrefixes.some((prefix) => packageName.startsWith(prefix))
          )
        },
      },
    ],
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        ...rolldownOutputOptions,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
