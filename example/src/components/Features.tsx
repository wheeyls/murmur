import React from 'react';

const features = [
  {
    icon: '⚡',
    title: 'Lightning Fast',
    description: 'Sub-50ms response times with our globally distributed edge network.',
  },
  {
    icon: '🔒',
    title: 'Secure by Default',
    description: 'End-to-end encryption, SOC2 certified, and GDPR compliant out of the box.',
  },
  {
    icon: '📊',
    title: 'Real-time Analytics',
    description: 'Live dashboards and custom reports to track everything that matters.',
  },
  {
    icon: '🔌',
    title: 'Easy Integrations',
    description: 'Connect with 200+ tools your team already uses. Set up in minutes.',
  },
  {
    icon: '🤝',
    title: 'Team Collaboration',
    description: 'Built-in workflows, comments, and approvals for seamless teamwork.',
  },
  {
    icon: '🚀',
    title: 'One-Click Deploy',
    description: 'Push to production with confidence. Automatic rollbacks if anything fails.',
  },
];

export function Features() {
  return (
    <section className="features" id="features">
      <div className="container">
        <span className="section-badge">Features</span>
        <h2 className="section-title">Everything you need to ship</h2>
        <p className="section-subtitle">
          Powerful alone. Unstoppable together.
        </p>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card">
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
