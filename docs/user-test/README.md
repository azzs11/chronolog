# User test: does the new UI find the root cause faster than the old one?

This is the Phase 6 success check: **"New UI finds the root cause faster than the old one (6-8 people)."**
You (the facilitator) run it; this folder has everything needed. Plan about 40 minutes per person.

## What is measured (decide nothing after seeing the data)

Written down before any session, so the result cannot be tuned:

1. **Primary:** time to a correct answer per task, in seconds, from "go" to the participant naming the right
   service. A wrong answer is said out loud and the clock keeps running; a task stops at **5 minutes** and counts
   as not solved (time recorded as 300 s).
2. **Secondary:** tasks solved within 5 minutes; SUS score for each UI (questionnaire below); the participant's
   confidence in each answer (1-5).
3. **Result rule:** the new UI "wins" if its median time per participant is lower for most participants. With 6-8
   people this is a small study: report every participant's numbers and the sign test from the script, and do not
   claim more than that.

## Design

- **Within-subject, counterbalanced.** Every participant uses both UIs, one task set on each.
  Order and sets rotate:

  | Participant | First | Second |
  |---|---|---|
  | P1, P5 | Old UI with set A | New UI with set B |
  | P2, P6 | New UI with set A | Old UI with set B |
  | P3, P7 | Old UI with set B | New UI with set A |
  | P4, P8 | New UI with set B | Old UI with set A |

- **Sets** (3 tasks each, one per fault kind, all of them produce an incident in both UIs):

  | Task | Fault (do not say this) | Answer | RootRank's own rank |
  |---|---|---|---|
  | A1 | disk full | `orders` | 1st |
  | A2 | CPU saturation | `catalog` | 2nd |
  | A3 | packet loss | `cart` | 2nd |
  | B1 | disk full | `cart` | 1st |
  | B2 | CPU saturation | `db` | 1st |
  | B3 | packet loss | `orders` | 2nd |

  Set B is a little easier for the ranker than set A; the rotation above cancels that out.

## Setup (once, before the first session)

```bash
# The new UI: the normal stack.
docker compose up -d

# The old UI (v2.0-p3, before the redesign), in a separate folder.
git worktree add ../chronolog-old v2.0-p3
(cd ../chronolog-old && npm ci)
```

The backend only accepts the web app on port 3000, so the two UIs take turns on that port:

- **New UI:** `scripts/user-test-task.sh A1` (keeps the new UI's container running) and open http://localhost:3000.
- **Old UI:** `KEEP_FRONTEND=0 scripts/user-test-task.sh A1` (stops the new UI's container), then
  `cd ../chronolog-old/apps/web && VITE_API_URL=http://localhost:5050 VITE_WS_URL=http://localhost:5050 npx vite --port 3000`
  and open http://localhost:3000.

Run every task script before the participant looks at the screen; it prints nothing about the answer. Pilot the
whole session once on yourself (or a friend) first, and throw that data away.

## Each session

1. **Consent** (read [consent.md](consent.md)). Give the participant an id (P1, P2, ...); never write their name
   next to the data.
2. **Warm-up, 3 minutes, on the UI they use first:** "This is a tool that reads the logs of a small online shop
   (gateway, auth, catalog, cart, orders, db). Have a look around." No hints about where answers are.
3. **Tasks.** For each of the 3 tasks in their set: run the task script, then say exactly:
   > "Something went wrong in the shop a few minutes ago. Using this tool, find which service caused it. Think out
   > loud. Tell me the service when you are ready, and how sure you are from 1 to 5."

   Start the clock on "go". Stop it when they name the right service. If they name a wrong one, say "not that one"
   and keep the clock running. Stop at 5 minutes. Note what they clicked and where they got stuck.
4. **SUS for that UI** ([sus.md](sus.md)).
5. Switch UI and task set; repeat steps 2-4.
6. **Two open questions:** "Which one would you want during an incident, and why?" and "What confused you?"

Do not help, hint or explain the UI during tasks. If they ask "what does this mean?", say "what do you think it
means?"

## Recording and analysis

Fill in [results-template.csv](results-template.csv) (one row per task, plus one SUS row per UI), then:

```bash
python3 scripts/user_test_analysis.py docs/user-test/results.csv
```

It prints, per UI: solved tasks, the median time, and the mean SUS. It also prints each participant's paired
difference and a two-sided sign test. Put the output, with the participant count and every caveat, into the
report. Publish it whichever way it goes.
