# log.sims.computer

A personal movie & TV log on [AT Protocol](https://atproto.com) — logging-first, tag-heavy, and interoperable with [Popfeed](https://popfeed.social) via shared lexicons.

Lives at [log.sims.computer](https://log.sims.computer).

See [SPEC.md](./SPEC.md) for the product spec and [docs/](./docs/) for architecture diagrams.

## Why

I want my watch history to be *mine*: portable records in my own PDS, readable by any app that speaks the lexicons, with a UI shaped around how I actually log — fast diary entries and indiscriminate tagging — rather than around reviews and ratings.

## Status

Working core: atproto login (OAuth + app password), TMDB search, logging with tags, the diary, and a Trakt-history importer (validated with a 5,500-play real export). Implementation is done via [Aviator](https://aviator.co) runbooks/verify sessions against this repo — this project doubles as a stress test of Aviator's verify infrastructure; every slice lands as a stacked PR verified in preview.

## License

MIT
