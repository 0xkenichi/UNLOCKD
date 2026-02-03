import { useState } from 'react';

const types = [
  {
    id: 'dutch',
    title: 'Dutch Auction',
    description: 'Price decays over time; first accept wins.'
  },
  {
    id: 'english',
    title: 'English Auction',
    description: 'Ascending bids until the timer closes.'
  },
  {
    id: 'sealed',
    title: 'Sealed Bid',
    description: 'Commit-reveal with a private bidding window.'
  }
];

export default function AuctionTypeSelector() {
  const [selected, setSelected] = useState('dutch');

  const handleSelect = (id) => {
    setSelected(id);
    const target = document.getElementById('auction-control');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="grid-2">
      {types.map((type) => (
        <div key={type.id} className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">{type.title}</h3>
              <div className="section-subtitle">{type.id.toUpperCase()}</div>
            </div>
            {selected === type.id && <span className="tag success">Selected</span>}
          </div>
          <p className="muted">{type.description}</p>
          <button
            className="button"
            type="button"
            onClick={() => handleSelect(type.id)}
          >
            {selected === type.id ? 'Selected' : 'Select'}
          </button>
        </div>
      ))}
    </div>
  );
}
