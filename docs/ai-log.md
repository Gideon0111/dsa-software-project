## Build 1: log

### Prompt 1: 
- **What I asked:** My project entails building an event ticketing platform where users/customers can buy tickets for events, organizers can also setup a particular event with prices, dates, location and other necessary information. Note; the project is divided into 9 different builds. Let us setup the environment first alongside all the necessary starter packages. 

## Build 2: log

### AI-B2-01: Impossible dates were accepted (30 February)

- **What the AI did:** the date check inherited from Build 1 (`requireIsoDate`) used `new Date(value)` and only checked for `NaN`.
- **What was wrong:** Node does not reject `2026-02-30`. It rolls it over to 2 March, so an impossible date passed as valid. S02 says a date "that is not a real date" must be rejected with `VALIDATION`.
- **How it was found:** read the validator against the S02 criterion, then ran `node -e 'console.log(new Date("2026-02-30"))'` and got `2026-03-02`.
- **Fix:** `src/domain/dates.js` with `parseRealDate`. It rebuilds the date from the year, month and day, and rejects it if they do not match. Used by `createEvent` and by the `from`/`to` filters.
- **Proof:** tests for `"2026-02-30"` as an event date and as a `to` filter; shown in `scripts/demo.js`.

### AI-B2-02: The prompt asked for an error code that did not exist

- **What the AI did:** the Build 2 prompt requires `INVALID_STATE` for publishing an event with no tiers.
- **What was wrong:** `ErrorCode` in `errors.js` only had four codes, and `DomainError` throws a `TypeError` for an unknown code, so the feature would have crashed instead of returning a clean error.
- **How it was found:** read `errors.js` before writing `publishEvent`.
- **Fix:** added `INVALID_STATE` to `ErrorCode`. A test checks all five codes.

### AI-B2-03: Event fields did not match the user stories

- **What the AI did:** Build 1 events used `name`, `location` and `startsAt`. S02 and S05 use `title`, `city` and `venue`, and search needs `city` separately.
- **What was wrong:** the prompt says "do not change what already works", but S02 cannot be met without changing the event shape. The two instructions conflict. Changing the shape also breaks `scripts/demo.js`.
- **How it was found:** compared `createEvent` in Build 1 with the S02 and S05 criteria.
- **Fix:** `createEvent`, the event view and the demo now use `title`, `city`, `venue`. `scripts/benchmark-lookup.js` was checked and needed no change.

### AI-B2-04: Bookings were CONFIRMED, but S06 says pending

- **What the AI did:** Build 1 `bookTickets` created bookings with status `CONFIRMED`.
- **What was wrong:** S06 says "a pending booking is created". Confirmation should only come after payment (S07, Build 4).
- **How it was found:** compared the S06 criterion with the booking code.
- **Fix:** added `BookingStatus.PENDING`; new bookings start as `PENDING`. Pending bookings still hold their seats.

### AI-B2-05: Test script would also run the helper file

- **What the AI did:** a plain `node --test` runs every `.js` file in `test/`, including `helpers.js`, which has no tests.
- **Fix:** the script is `node --test "test/**/*.test.js"`, so only `*.test.js` files run.

### Decisions where we went silent

| Question | Decision |
|---|---|
| Publish an already-published event | `INVALID_STATE` |
| Unpublish a draft | `INVALID_STATE` |
| Book a ticket on a draft event | Not blocked (S06 only describes the published case) |
| Money wording | S06 says "whole cents"; the project stores whole kobo, in fields named `priceCents` (a Build 1 decision) |
| Date-only `to` filter | Means the whole day, in UTC |
| Price filters and events with no tiers | Left out of price filters; last in price sort |
| Cheapest price of an event | Lowest tier price, counting every tier |