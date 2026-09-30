# Magic Conch

A Tampermonkey userscript for automated course playback on the Yizhi platform, supporting `https://pc.kmelearning.com/*`.

## Installation and Usage

Use a current version of Chrome. Create a new script in Tampermonkey, paste the entire contents of `pc.js`, and save. Sign in to the platform, refresh the page, and click the Start button on the floating panel. After updating the script, save and refresh all open course windows.

On the task page, expand **Select learning tasks** in the panel and check the maps you want before starting. Starting directly inside a map selects that map when no selection has been saved. Pause to change your selection.

Features include continuous course playback, automatic muting, and 1–6 concurrent course windows. If a section remains unmarked after playback and a synchronization wait, the script replays the last 30 seconds. It pauses if the section is still incomplete after three replays. The platform's learning records determine completion.
