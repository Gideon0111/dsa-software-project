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


## Build 3: log
## AI-B3-01: architecture doc and booking state machine

- **What I asked:** Build 3 items 1 and 2 of the prompt in docs/build-3.md: `docs/architecture.md` with three Mermaid diagrams, and `src/domain/bookingStateMachine.js` with `canTransition` and `assertTransition`.
- **What came back:** the architecture doc, the state machine (five states, allowed moves kept as data), and a test file that checks all 5 allowed and all 20 refused pairs.
- **What was wrong:**
  - The prompt says to throw a `DomainError` with code `INVALID_TRANSITION`, but `DomainError` throws a `TypeError` for any code that is not in `ErrorCode`. Followed literally, the state machine would have crashed with the wrong error.
  - The first test run used `node --test test/`, which fails on Node 22 (`MODULE_NOT_FOUND`). The project's `npm test` uses a glob and works.
- **What I changed:** added `INVALID_TRANSITION` to `ErrorCode` (one line, nothing rewritten). Later, a test (`httpErrors.test.js`) fails if any error code has no HTTP status, so a new code cannot be forgotten.
- **Checked:** the three Mermaid diagrams parse with the real Mermaid parser. 

## AI-B3-02: making inventory.js use the state machine

- **What I asked:** to change `inventory.js` so bookings use the state machine. 
- **What came back:** `BookingStatus` now points to the state machine's list; `cancelBooking` calls `assertTransition` instead of its own "already cancelled" check.
- **What was wrong:**
  - `inventory.js` had its own status list (`PENDING`, `CONFIRMED`, `CANCELLED`, uppercase) that did not match the spec (`pending`, `paid`, `cancelled`, `refunded`, `checked_in`). `CONFIRMED` was never used anywhere.
  - Build 2 had **no tests for `cancelBooking`**, so a change in its behaviour (cancelling twice used to be `CONFLICT`, now `INVALID_TRANSITION`) would not have been caught.
  - The first error message read badly: "A cancelled booking cannot become cancelled".
- **What I changed:** added `test/cancelBooking.test.js` (7 tests, including "seats are released only once"); message is now "The booking is already cancelled"; fixed the comment; `inventory.test.js` now expects six error codes.

## AI-B3-03: router, web server, static files, config (Steps 3 to 6)

- **What I asked:** items 3, 4 and 5 of the prompt: a router with `:params`, a `node:http` server with `/health`, JSON errors and safe static files, `config.js`, `server.js`, a `start` script, and tests including one real HTTP request.
- **What came back:** `src/http/router.js`, `errors.js`, `static.js`, `app.js`, `src/config.js`, `src/server.js`, `public/`, and 156 tests passing in total (the HTTP error file was renamed in Entry 4).
- **What was wrong or risky:**
  - Parsing the URL with `new URL(req.url, base)` is unsafe here: in Node 22, `new URL("//evil.com/secret", base)` reports host `evil.com` and path `/secret`. I checked this. The code splits the path by hand.
  - The AI first claimed that reading the body with `for await` and stopping early would destroy the connection before the 413 reply. **I tested it** (20 requests each, with 120-byte and 5 MB bodies): both versions returned 413 every time. The claim was wrong. The event-based reader is kept because it works and is tested, but it is not proven necessary and could be simplified.
  - All tests passed on the first run, so I broke the code on purpose four times (allow dot-names, skip the real-path check, decode twice, drop a status). The tests failed each time (3, 1, 1 and 3 failures). That showed the tests really check something.
  - A bad-JSON 400 cannot be triggered on the real server yet, because no route accepts a body until Build 4. It is tested with a test route, and by `scripts/verify-build-3.js`.

## AI-B3-04: review round (my questions and my own run of the verify script)

- **What I asked:** why there are two error files (one in `src/domain/`, one in `src/http/`), why the 413 status was not in the HTTP error file, and I ran `node scripts/verify-build-3.js` on my own machine (Node 24.19.0).
- **What was wrong:**
  - **I noticed** the HTTP error file defined the error *codes* but not their status numbers. The numbers (400, 404, 405, 413) were typed in `app.js` and `static.js` next to each `throw`, so the HTTP errors were spread over three files, while the domain errors were in one table.
  - **The verify script reported `npm test: 0 passed, 1 failed` on my machine** although the tests passed. The script read the test summary in the Node 22 format (`# pass 156`), but Node 24 prints `ℹ pass 156`, so it found no numbers and failed. The tests were fine; the AI's script was wrong. I would not have found this on Node 22.
- **What I changed:**
  - Renamed `src/http/errors.js` to `src/http/httpErrors.js`, so it is not confused with `src/domain/errors.js`. Domain errors describe business problems and know nothing about HTTP; HTTP errors describe web problems and translate domain errors into status numbers.
  - Every HTTP error now lives in `httpErrors.js`: the codes, an `HTTP_STATUS` table, and one function per error (`badJson()`, `notFound()`, `methodNotAllowed()`, `payloadTooLarge()`...). `HttpError` now takes only a code, like `DomainError`, and gets its status from the table. `app.js` and `static.js` no longer contain an error status number.
  - Added tests (169 in total): every `HttpCode` has a status, unknown codes are refused, each error function returns the right status. Added a verify check that only `httpErrors.js` may call `new HttpError(`.
  - The verify script now accepts both summary formats and trusts the exit code first. I checked it on Node 22.22 and Node 24.19: 169 tests pass and 40 of 40 checks pass on both.