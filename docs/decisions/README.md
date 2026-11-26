# Decision records

The decisions in this project that had a real alternative, with the option rejected, what the
choice costs, and the test behind it. Each is written when the decision is made.

1. [Scoring runs on the phone, and a server only checks it](0001-scoring-runs-on-the-phone.md):
   the rules are written once, as a function from data to data, and held to cases any other
   implementation has to pass.
2. [Games are saved as they were entered, in IndexedDB](0002-games-are-saved-as-entered.md): no
   total is saved, so the scores and the games cannot disagree.
3. [Rule options belong to the scoring package, and the published rule is the
   default](0003-rule-options-belong-to-the-scoring-package.md): an option's meaning is fixed
   within a version of a rule set, and an option or a value added stays in it.
4. [Screens load on demand](0004-screens-load-on-demand.md): a page sends the shell and its own
   screen's code, and a new screen adds only its own file.
5. [Every change to how a game scores is a new
   version](0005-every-change-to-scoring-is-a-new-version.md): a correction included, so a version
   always means the same rules on every build, and every released answer is pinned.
