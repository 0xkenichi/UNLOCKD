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
  return (
    <div className="grid-2">
      {types.map((type) => (
        <div key={type.id} className="holo-card">
          <h3 className="holo-title">{type.title}</h3>
          <p className="muted">{type.description}</p>
          <button className="button">Select</button>
        </div>
      ))}
    </div>
  );
}
