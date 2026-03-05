import React from 'react';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="logo-icon">◆</span>
          <span className="logo-text">Acme</span>
          <p className="footer-tagline">Build faster. Ship with confidence.</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4 className="footer-col-title">Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#changelog">Changelog</a>
            <a href="#docs">Documentation</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Company</h4>
            <a href="#about">About</a>
            <a href="#blog">Blog</a>
            <a href="#careers">Careers</a>
            <a href="#contact">Contact</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Legal</h4>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#security">Security</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <span>© 2025 Acme Inc. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
