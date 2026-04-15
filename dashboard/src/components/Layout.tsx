import { Outlet, NavLink } from 'react-router-dom';
import { Crosshair, Clock, Eye, Settings as SettingsIcon, Zap, Radar, Database, Orbit } from 'lucide-react';

const navItems = [
  { to: '/', icon: Orbit, label: '机会工作台' },
  { to: '/command-center', icon: Crosshair, label: '执行控制台' },
  { to: '/radar', icon: Radar, label: '全局大盘雷达' },
  { to: '/radar-raw', icon: Database, label: '底层数据透视' },
  { to: '/missions', icon: Clock, label: '任务时间线' },
  { to: '/watchlist', icon: Eye, label: '监控池' },
  { to: '/settings', icon: SettingsIcon, label: '配置' },
];

export function Layout() {
  return (
    <div className="spa-root">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <Zap size={20} className="brand-icon" />
          <span className="brand-text">SINEIGE</span>
          <span className="brand-sub">ALPHA ENGINE</span>
        </div>

        <div className="nav-items">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="version-badge">v3.3</div>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
