# Magic Conch

A Tampermonkey userscript for automated course playback on the Yizhi platform, supporting `https://pc.kmelearning.com/*`.

## Installation and Usage

Use a current version of Chrome. Create a new script in Tampermonkey, paste the entire contents of `pc.js`, and save. Sign in to the platform, refresh the page, and click the Start button on the floating panel. After updating the script, save and refresh all open course windows.

Expand the task selector in the panel on any page. All maps are selected by default; pause to change your selection. Use **Refresh tasks** to update the list. Concurrent windows can work across selected maps.

Features include continuous course playback, automatic muting, and 1–6 concurrent course windows. If a section remains unmarked after playback and a synchronization wait, the script replays the last 30 seconds. It pauses if the section is still incomplete after three replays. The platform's learning records determine completion.
