# Event Ticketing and Booking: Course Capstone

**Organizers publish events. Attendees buy tickets. Staff check people in with QR codes.**

You will build a full-stack ticketing platform over nine weekly Build sessions, using an AI coding tool as your partner. The app looks simple on the surface. It hides three hard problems, and solving them well is what this project is about.

## The three hard problems

1. **Overselling.** One ticket is left and fifty people press Buy at the same moment. Exactly one of them must get it.
2. **Refunds.** When someone cancels, how much money goes back depends on how close the event is, and the seats must be released exactly once.
3. **Waitlists.** When an event is sold out and a seat frees up, the person who has waited longest is offered it, for a limited time, and then it passes to the next person.

## What you will build

| Role | What they can do |
|---|---|
| **Organizer** | Create, edit and publish events and ticket tiers. See bookings for their own events only. |
| **Attendee** | Browse and search events, book tickets, pay (mock payment), cancel and get a refund, join waitlists, see their own tickets. |
| **Staff** | Scan tickets at the door for events they are assigned to. Nothing else. |

The finished project has a website (HTML, CSS, JavaScript), a JavaScript API, and a database. Payments are simulated: no real money moves.

## How the course works

Every Build session has four steps:

1. **Gap lesson.** Your instructor teaches the things you have not been taught yet but need for this build.
2. **Prompt and build.** You give your AI tool a clear description of the milestone and the rules, and let it write a first draft.
3. **Review.** You read the code, run it, and decide what is wrong. You fix it, and you tell the AI why it was wrong.
4. **Ship.** You commit on a branch named `build-N`, open a pull request into `main`, and merge it.

**The AI writing the code is not the skill being graded.** The skill is knowing what to ask for, and knowing whether what came back is correct.

### The AI log

Keep a file called `docs/ai-log.md`. For every important prompt, write:

- what you asked,
- what came back,
- what was wrong with it (or "nothing"), and what you changed.

You will add at least one entry in every build. It counts toward your grade.

## Stack

- **Frontend:** HTML, CSS, JavaScript (no framework)
- **Backend:** Node.js 22.13 or newer, JavaScript API
- **Database:** SQLite
- **Tests:** Node's built-in test runner
- No outside packages are needed. Check your Node version with `node --version`.

## Documents

- [docs/milestones.md](docs/milestones.md): the nine builds, what each delivers, and when it is done.
- [docs/user-stories.md](docs/user-stories.md): the product backlog with acceptance criteria and the definition of done.

## Rules of the road

- Work on a branch called `build-N`, open a pull request, merge to `main`. Do not push straight to `main`.
- Never commit secrets, passwords or `.env` files.
- Money is stored as whole numbers of the smallest unit (kobo or cents), never as decimals.
- You are responsible for every line of your project, including the lines the AI wrote.
