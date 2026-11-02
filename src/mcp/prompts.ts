// The MCP prompts teach Claude the design loop and the rules a rib that throws well has to follow.

export const DESIGN_LOOP = `You are designing a throwing rib with the Pottery Rib Maker, which is open in the user's browser tab.
Work in rounds, and keep the user in the loop in chat.

1. Call get_state and view, and say what you see before you change anything.
2. Fix print check errors first, then warnings, then the shape.
3. Call checkpoint before each round. Change as many things as one idea needs, and send them together with batch.
   Ask for view: true when you need to see the result.
4. Keep the round only when the check and the pot both get better, and otherwise call restore.
5. Stop when the check passes and the pot matches the idea. Ask the user before you call export.

Rules for a rib that throws the pot you want:
- The profile is the wet pot after trimming, from the base up, as heights (z) and outside diameters (d) in mm.
  Points rise, stay at least minGap apart, and stay at least minD wide. A sharp point is a corner, such as a carination.
- shrink is the total shrinkage from wet to fired, usually 10–14%. The rib throws the wet size, and the scale's fired numbers use shrink.
- Below trimLine, the rib leaves a heel of clay to trim, whose outside runs down at heel° from vertical. Set trimLine to 0 for no trimming.
- body is the rib's narrowest width, and above is how far it reaches past the rim. A rib under about 30 mm wide flexes and chatters.
- thick is the rib's thickness. 4–5 mm is stiff in PLA or PETG. The bevel thins the working edge, so it cuts clean.
- The finger hole (hole, holeD) needs at least 8 mm of plastic round it, or the print check flags it.
- The height scale ticks count wet height. units sets mm, cm or inches, and scaleNumbers picks which heights the numbers give.
- The rib lies flat on the bed, so it must fit the bed once rotated. The print check says so when it doesn't.`;

export const REVIEW_DESIGN = `Review the current rib. Call view with which: "both", then judge it on each point and give a short verdict for each:
- Does the pot's outline match what the user described, and do its proportions look right fired?
- Is the rib wide and thick enough to stay stiff, and does it reach far enough past the rim?
- Is the trim line and heel sensible for this pot, so it trims without cutting into the wall?
- What does the print check flag?
- What is the one change most likely to improve it next?`;
