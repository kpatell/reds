# Reds: Official Game Rules & Logic Specifications

**Reds** is a strategic two-player card game minimizing hand value.

## 1. Data Structures & Setup
* **Deck:** 54 cards (52 Standard + 2 Jokers).
* **Grid System:**
    * Each player has a **Hand** represented as a dynamic 0-indexed array.
    * **Initial State:** `[0, 1, 2, 3]`.
    * **Visual Layout:**
        * Slots 0, 1: Top Row (Furthest from player)
        * Slots 2, 3: Bottom Row (Closest to player)
        * Slots 4+: Added sequentially if penalties occur.
* **Initial Deal:**
    * Player 1 and Player 2 receive 4 cards each (Face-down/Hidden).
    * **Preview Phase:** Players may reveal cards at indices `2` and `3` (Bottom Row) exactly once.
    * **State Transition:** Game moves to `TURN_P1` only after both players confirm they have viewed their cards.
* **Turn Order:**
    * **First Game:** The Game Creator (Host) takes the first turn.
    * **Subsequent Games:** The Winner of the previous round takes the first turn.

## 2. Gameplay Loop (State Machine)
The game alternates turns. The active player MUST perform **Action A** then **Action B**.

### A. Draw Phase
* Player chooses source: `DECK` or `DISCARD`.
* **Empty Deck Rule:** If the `DECK` is empty when a player tries to draw, the `DISCARD` pile (excluding the top card) is shuffled to create a new `DECK`.
* **Restriction:** If `DISCARD` pile is empty (and wasn't just reshuffled), player must draw from `DECK`.
* **Card Visibility:**
    * Drawn from Deck: Visible only to current player.
    * Drawn from Discard: Visible to both.

### B. Action Phase
1.  **Swap:**
    * Select index `0-n` in hand.
    * Swap drawn card with hand card.
    * Old hand card goes to `DISCARD` (Face Up).
2.  **Discard (Play):**
    * Place drawn card into `DISCARD`.
    * **Constraint:** If card was drawn from `DISCARD` pile in Phase A, it **cannot** be discarded immediately. It MUST be Swapped.
3.  **Power Play (Special Discard):**
    * **Trigger:** Player draws a Power Card (7, 8, 9, 10) from **DECK** (not Discard pile) and immediately Discards it.
    * **Effect:** Power activates. See Section 3.

### C. The "Stacking" Interrupt (Async Mechanic)
* **Condition:** A card exists on top of the `DISCARD` pile. A player has a card in their hand of the **exact same Rank** (e.g., Discard is 5♣, Player has 5♥).
* **Timing:** Can be performed at **ANY** time (during opponent's turn, during animation, etc.) as long as the Discard pile top card hasn't changed.
* **Special Rules:**
    * **Self-Stacking:** Allowed (e.g., Player discards a 5, then immediately stacks another 5 from their hand).
    * **Rank Equivalence:** Suit and Color do NOT matter, only Rank.
        * *Note:* A Red King (-2) technically matches a Black King (13). This is a legal move.
    * **Jokers:** Jokers are **NOT** Wild for stacking. A Joker only matches another Joker. You cannot stack a Joker on a 5.
    * **NO Powers:** Stacking a Power Card (e.g., stacking a 7 on a 7) **NEVER** activates the power. Powers only activate on a specific Turn-based Discard action.
* **Action:** Player moves card from hand to Discard pile.
* **Outcome:** Player hand size decreases by 1.
* **Penalties:**
    * **Late Stack:** If the Discard pile changes before the stack request hits the server (race condition):
        1. The stack fails. The card returns to the player's hand.
        2. **Penalty:** The player receives ONE additional card from the Draw Pile.
        3. The penalty card is placed **Face-down**. The player cannot look at it.
        4. The player now has +1 total cards (e.g., 4 -> 5).
    * **Wrong Stack:** If player attempts to stack a non-matching card:
        1. The card returns to the player's hand.
        2. **Penalty:** The player receives ONE additional card from the Draw Pile (Face-down).
        3. The player now has +1 total cards.

## 3. Power Card Logic
These only activate if drawn from **DECK** and immediately **DISCARDED** during a normal turn.

### **Knowledge Persistence Rule**
* **Reset on Transfer:** If a card moves from one hand to another (e.g., via Power 9 Swap), it becomes **Unknown/Face-down** to the new owner, even if the previous owner knew what it was. The "Viewed" status is lost.
* **Penalty Cards:** Penalty cards are dealt Face-down and are **Unknown** to the player. They can only be viewed later via Powers (7 or 10).

### **The Empty Hand Rule (Power Fizzle)**
If the Opponent has **0 cards** (waiting to call REDS), Powers cannot target them:
* **8 (View Opp):** Cannot be used. The card is treated as a normal discard.
* **9 (Swap):** Cannot be used. The card is treated as a normal discard.
* **10 (View/Swap):** You may view your own card, but the swap/opponent-view portion is invalid.
* *Player Action:* In these cases, the player must simply Discard the card (for no effect) or Swap it into their own hand.

### **Power Definitions**
* **General Rule (Public Awareness):** The opponent **must** be notified of *which* cards are being targeted, viewed, or swapped, even if the values remain hidden.

* **7 (View Self):**
    * **Action:** Choose one index in your own hand. View it.
    * **Opponent Visibility:** Opponent sees a "Viewed" indicator on that specific card (e.g., "Player 1 is looking at their card #2"). Value is hidden.

* **8 (View Opponent):**
    * **Action:** Choose one index in the *opponent's* hand. View it.
    * **Opponent Visibility:** Opponent sees a "Viewed" indicator on their specific card (e.g., "Player 1 is looking at your card #3"). Value is hidden from Opponent.

* **9 (Blind Swap):**
    * **Action:** Choose one index in your own hand and one index in the opponent's hand.
    * **Decision:** You may **Swap** them OR **Skip** the action.
    * **Opponent Visibility:**
        * If Swapped: Opponent sees the two cards physically move/swap locations. Values remain hidden.
        * If Skipped: Opponent sees a notification "Player 1 declined to swap."

* **10 (View & Swap):**
    * **Step 1 (View):** Choose one index in your own hand and one index in the opponent's hand. Reveal both values to *yourself* only.
    * **Step 2 (Decision):** You may **Swap** them OR **Skip** the action.
    * **Opponent Visibility:**
        * During Step 1: Opponent sees "Inspection" indicators on both cards involved.
        * During Step 2: Opponent sees the cards physically swap OR sees a "Player 1 declined to swap" notification.

## 4. End Game Scenarios
There is only **one** way the game ends:

1.  **Calling "REDS":**
    * **Constraint:** Can only be called at the very start of a turn (before drawing).
    * **Zero Cards Rule:** If a player has 0 cards (due to Stacking), the round does NOT end immediately.
        * The player must wait for their turn.
        * On their turn, they must call "REDS".
    * **Event:** Once "REDS" is called, the caller's turn ends immediately.
    * **Final Turn:** The **Opponent** gets exactly **one** final turn.
        * Opponent draws/discards as normal.
        * Opponent can use Power Cards if drawn.
        * Stacking is still allowed during this turn.
    * **Resolution:** Reveal all cards. Calculate Score.

## 5. Scoring & Winning
* **Values:**
    * Joker: 0
    * Ace: 1
    * 2-10: Face Value
    * Jack: 11
    * Queen: 12
    * King (Black - ♠️/♣️): 13
    * King (Red - ♥️/♦️): -2
* **Resolution:**
    * Caller Wins: Caller Score < Opponent Score.
    * Opponent Wins: Caller Score >= Opponent Score (Tie goes to non-caller).