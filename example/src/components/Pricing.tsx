import React from 'react';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    period: '/month',
    description: 'For individuals and small projects',
    features: ['Up to 3 projects', '1 team member', '1GB storage', 'Community support'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For growing teams that need more',
    features: ['Unlimited projects', 'Up to 10 members', '50GB storage', 'Priority support', 'Advanced analytics', 'Custom domains'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    description: 'For large organizations',
    features: ['Unlimited everything', 'Unlimited members', '1TB storage', 'Dedicated support', 'SSO & SAML', 'SLA guarantee', 'Custom integrations'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <span className="section-badge">Pricing</span>
        <h2 className="section-title">Simple, transparent pricing</h2>
        <p className="section-subtitle">No hidden fees. No surprises. Cancel anytime.</p>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div key={plan.name} className={`pricing-card ${plan.highlighted ? 'pricing-card-highlighted' : ''}`}>
              {plan.highlighted && <span className="pricing-popular">Most Popular</span>}
              <h3 className="pricing-name">{plan.name}</h3>
              <p className="pricing-desc">{plan.description}</p>
              <div className="pricing-price">
                <span className="pricing-amount">{plan.price}</span>
                <span className="pricing-period">{plan.period}</span>
              </div>
              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature">✓ {f}</li>
                ))}
              </ul>
              <a href="#signup" className={`btn ${plan.highlighted ? 'btn-primary' : 'btn-secondary'} pricing-cta`}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
