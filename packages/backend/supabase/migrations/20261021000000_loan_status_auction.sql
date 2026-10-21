-- LoanManager v1 core: a defaulted loan is sold by a Dutch auction before it is
-- liquidated, so track the in-between state (LoanManager.Status.Auction).
alter type loan_status add value if not exists 'auction' after 'active';
