export default function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="feature-card">
      <div className="feature-icon-wrapper" aria-hidden="true">
        {Icon && <Icon className="feature-icon" size={32} strokeWidth={1.5} />}
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-description">{description}</p>
    </div>
  );
}
