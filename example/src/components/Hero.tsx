import React from 'react';

export function Hero() {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <span className="hero-badge">Now in Public Beta</span>
        <h1 className="hero-title">
          Build faster.<br />Ship with confidence.
        </h1>
        <p className="hero-subtitle">
          Acme gives your team the tools to move fast without breaking things.
          From idea to production in minutes, not months.
        </p>
        <div className="hero-actions">
          <a href="#signup" className="btn btn-primary">Start Free Trial</a>
          <a href="#demo" className="btn btn-secondary">Watch Demo</a>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">10k+</span>
            <span className="stat-label">Teams</span>
          </div>
          <div className="stat">
            <span className="stat-value">99.9%</span>
            <span className="stat-label">Uptime</span>
          </div>
          <div className="stat">
            <span className="stat-value">50ms</span>
            <span className="stat-label">Avg Response</span>
          </div>
        </div>
      </div>
    </section>
  );
}
