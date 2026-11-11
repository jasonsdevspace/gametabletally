# Decision records

The decisions in this project that had a real alternative, with the option rejected, what the
choice costs, and the test behind it. Each is written when the decision is made.

1. [Scoring runs on the phone, and a server only checks it](0001-scoring-runs-on-the-phone.md):
   the rules are written once, as a function from data to data, and held to cases any other
   implementation has to pass.
2. [Games are saved as they were entered, in IndexedDB](0002-games-are-saved-as-entered.md): no
   total is saved, so the scores and the games cannot disagree.
