# Magic Conch

A Tampermonkey userscript for Yizhi (`pc.kmelearning.com`) and Jiangnan Financial Training (`jnftc.jnbank.com.cn`). The panel detects the platform automatically.

## Installation and Usage

Use a current version of Chrome. Create a new script in Tampermonkey, paste the entire contents of `pc.js`, and save. Sign in to the platform, refresh the page, and click the Start button on the floating panel. After updating the script, save and refresh all open course windows.

Expand the task selector in the panel on any page. All maps are selected by default; pause to change your selection. Use **Refresh tasks** to update the list. Concurrent windows can work across selected maps.

Features include continuous course playback, automatic muting, and 1–6 concurrent course windows. If a section remains unmarked after playback and a synchronization wait, the script replays the last 30 seconds. It pauses if the section is still incomplete after three replays. The platform's learning records determine completion.

Jiangnan: sign in manually, then click Start. Tasks run sequentially in one window, with normal video playback and a final recording wait. Login expiry waits for you to sign in again. Complete required exams and evaluations manually, then resume. This platform's end-to-end learning flow is pending validation with an unfinished account.

Changing Yizhi accounts clears previous learning caches and stops stale windows. Panel preferences remain unchanged.
