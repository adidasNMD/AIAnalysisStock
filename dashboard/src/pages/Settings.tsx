import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, CheckCircle } from 'lucide-react';
import { fetchModelsConfig, saveModelsConfig as apiSaveConfig } from '../api';
import type { ModelsConfig } from '../api';

export function Settings() {
  const [config, setConfig] = useState<ModelsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModelsConfig().then(c => { setConfig(c); setLoading(false); });
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const ok = await apiSaveConfig(config);
    setSaving(false);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  };

  const updateModel = (key: string, field: string, value: string | number) => {
    if (!config) return;
    setConfig({
      ...config,
      models: {
        ...config.models,
        [key]: { ...config.models[key], [field]: value },
      },
    });
  };

  const updateDefault = (field: string, value: string) => {
    if (!config) return;
    setConfig({ ...config, defaults: { ...config.defaults, [field]: value } });
  };

  if (loading) return <div className="page loading-state"><RefreshCw size={24} className="spin" /> 加载配置...</div>;
  if (!config) return <div className="page error-state">⚠️ 无法加载 models.yaml 配置</div>;

  return (
    <div className="page settings">
      <div className="page-header">
        <h1><SettingsIcon size={24} /> 统一模型配置</h1>
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saved ? <><CheckCircle size={14} /> 已保存</> : saving ? <><RefreshCw size={14} className="spin" /> 保存中...</> : <><Save size={14} /> 保存到 YAML</>}
        </button>
      </div>

      <p className="settings-hint">编辑 config/models.yaml — 所有服务实时生效</p>

      {/* 基础配置 */}
      <section className="settings-section glass-panel">
        <h3>🔧 基础配置</h3>
        <div className="settings-row">
          <label>Provider</label>
          <input value={config.defaults.provider} onChange={e => updateDefault('provider', e.target.value)} />
        </div>
        <div className="settings-row">
          <label>Base URL</label>
          <input value={config.defaults.base_url} onChange={e => updateDefault('base_url', e.target.value)} />
        </div>
      </section>

      {/* 模型配置 */}
      <section className="settings-section glass-panel">
        <h3>🧠 模型档案</h3>
        {Object.entries(config.models).map(([key, profile]) => (
          <div key={key} className="model-profile">
            <div className="model-name">{key === 'deep_think' ? '🔬 深度思考' : key === 'quick_think' ? '⚡ 快速思考' : `📦 ${key}`}</div>
            <div className="model-fields">
              <div className="settings-row">
                <label>Model</label>
                <input value={profile.model} onChange={e => updateModel(key, 'model', e.target.value)} />
              </div>
              <div className="settings-row compact">
                <label>Temperature</label>
                <input type="number" step="0.1" min="0" max="2" value={profile.temperature} onChange={e => updateModel(key, 'temperature', parseFloat(e.target.value))} />
              </div>
              <div className="settings-row compact">
                <label>Max Tokens</label>
                <input type="number" step="1024" value={profile.max_tokens} onChange={e => updateModel(key, 'max_tokens', parseInt(e.target.value))} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 角色映射 */}
      <section className="settings-section glass-panel">
        <h3>🎭 角色映射 (Service → Model Profile)</h3>
        {Object.entries(config.services).map(([service, roles]) => (
          <div key={service} className="service-roles">
            <div className="service-label">{service}</div>
            <div className="roles-grid">
              {Object.entries(roles).map(([role, profile]) => (
                <div key={role} className="role-item">
                  <span className="role-name">{role}</span>
                  <select
                    value={profile}
                    onChange={e => {
                      setConfig({
                        ...config,
                        services: {
                          ...config.services,
                          [service]: { ...config.services[service], [role]: e.target.value },
                        },
                      });
                    }}
                  >
                    {Object.keys(config.models).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
