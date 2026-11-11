# Year-end BTC call spreads

A desk for bull call spreads on Deribit’s year-end bitcoin expiry (25 Dec, 08:00 UTC). You set a settlement band — it opens on 80–100k, direction up — and it ranks every liquid call spread that expresses a move into that band.

The most you can lose is the debit, in bitcoin. Deribit pays the call in bitcoin (`max(settlement − strike, 0) / settlement`), so profit peaks at the short strike and then fades if the price keeps rising.

## What it ranks

Debits are the price to cross the market: buy the long call at the ask, sell the short call at the bid.

- **Inside the band** — average bitcoin profit if expiry lands in your range, weighted by the call curve, divided by the debit.
- **At the top** — bitcoin profit if expiry prints the top of the band, divided by the debit.
- **Market odds** — risk-neutral average profit over the whole curve, divided by the debit. This is not an edge. On these books it is negative, and similar across spreads.

The chance of profit is the risk-neutral probability read from the slope of the call curve. It is what the market is implying, not a forecast.

## Run it

```bash
npm install
npm run dev
```

The app serves on port 3847 and loads the live Deribit book in the browser. If that request fails, it uses `data/snapshot.json`.

```bash
npm test
```

## GitHub Pages

The static site is on the `gh-pages` branch and is served at [rvmz.github.io/btc-call-spreads](https://rvmz.github.io/btc-call-spreads/). In the repository settings, set Pages to deploy from the `gh-pages` branch and the `/` folder. Deribit allows that origin, so Refresh still loads the live book.

Rebuild and update the branch after a source change:

```bash
NEXT_PUBLIC_BASE_PATH=/btc-call-spreads npm run build
```

Then copy the contents of `out/` onto `gh-pages`, including `.nojekyll`.
