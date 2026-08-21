# How Kreds are awarded

Kreds exist to answer one question honestly: **who is moving this team forward?**
Everything below follows from that.

## Default values

| Action                                   | Kreds | Goes to              |
| ---------------------------------------- | ----- | -------------------- |
| Pull request merged to `main` / `master` | 25    | The author           |
| Code review submitted                    | 15    | The reviewer         |
| Your pull request gets approved          | 10    | The author           |
| Issue closed                             | 10    | Whoever closed it    |
| Five-day contribution streak             | 50    | Once per streak      |
| Finish the week at #1                    | 100   | Awarded Friday 18:00 |
| Commit pushed to any branch              | 1     | **Off by default**   |

Every value is editable by a team admin.

## The ratio is the design

A review is 15 and a merge is 25, so **two reviews beat one merge**. That is not
an accident and it is not a placeholder — it is the entire opinion of the product
expressed as a number.

If you invert it, you get a tool that rewards whoever opens the most pull
requests, and a team that quietly stops reviewing each other's work. There are
plenty of those already.

This is also why **commit pushed ships turned off.** It is the one rule that
rewards volume rather than collaboration, and a team that turns it on will watch
someone discover `git commit --amend` is optional. It exists because some teams
genuinely want it. It defaults to off because most should not.

## Streaks

A streak is a run of consecutive days with at least one scoring action. Missing a
day resets it to zero. The bonus is awarded **once per streak**, not once per
day — otherwise a long streak compounds into an unreachable lead.

Weekends do not break a streak by default. Rest is not a performance problem.

## Awards are immutable

Every award is stored as a row: what happened, who it went to, the source GitHub
event, and **the amount granted at that moment**.

Changing a rule value affects future awards only. If an admin raises "PR merged"
from 25 to 30, last month's merges stay at 25. A leaderboard that silently
rewrites itself when someone edits a setting is not a leaderboard, it is a rumour.

## Nothing is ever counted twice

GitHub redelivers webhooks — on failure, on timeout, and whenever someone hits
"Redeliver" in the App settings. A redelivery must never pay twice.

Every award is keyed on `(event type, GitHub node id, recipient)` with a unique
index. A replayed event collides with the row already there and is dropped.

Note what the key is _not_: the delivery id. GitHub issues a new one on every
redelivery, so keying on it would credit the same merge again every time.

## Auditability

Every profile has a ledger. Each line is one award, linked to the pull request,
review or issue that produced it:

```
+25   PR #128 merged            api          2 hours ago
+15   Review on PR #131         web          5 hours ago
+50   5-day streak              —            yesterday
```

If someone questions a number, the answer is one click away. That matters more
than it sounds — a leaderboard people cannot audit is a leaderboard people stop
believing.

## Tuning for your team

Some patterns worth knowing:

**A team that under-reviews.** Raise reviews to 20 and drop merges to 20. Reviews
become the only efficient way to climb.

**A team drowning in tiny PRs.** Leave the values alone and add a challenge
instead — "no PR waits more than 24 hours" rewards responsiveness without
distorting the base scoring.

**A team with wildly different seniority.** Squads (Team plan) let you scope the
leaderboard so juniors are not measured against staff engineers. A leaderboard
that always has the same winner stops being motivating for everybody else.

**A team gaming it.** It will happen, and it is usually a signal rather than a
problem — someone is telling you the incentives are wrong. Move the numbers.

---

Rules live in **Team → Rules**. Changes take effect on the next event.
