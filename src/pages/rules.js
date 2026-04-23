import { isLoggedIn, isAdmin } from '../api.js';
import { navigate } from '../router.js';
import { showOnboarding } from '../components/onboarding.js';

export async function rulesPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <div class="dashboard-header">
        <h1>&#128214; Rules</h1>
        <button id="rewalkthrough-btn" class="btn btn-sm">Replay walkthrough</button>
      </div>

      <div class="rules-section">
        <h2>How It Works</h2>
        <p>The Lima Baseball Championship Series turns your production metrics into a baseball game. Every time you complete a qualifying event, it counts as a hit — advancing runners on the bases and scoring runs for your team.</p>
      </div>

      <div class="rules-section">
        <h2>Production Events = Hits</h2>
        <div class="rules-table-wrapper">
          <table class="stats-table">
            <thead>
              <tr>
                <th>Production Event</th>
                <th>Hit Type</th>
                <th>Bases</th>
                <th>What Happens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>App Taken</td>
                <td><span class="play-type play-single">1B</span></td>
                <td>1</td>
                <td>Batter goes to 1st, runners advance 1 base</td>
              </tr>
              <tr>
                <td>Light House</td>
                <td><span class="play-type play-double">2B</span></td>
                <td>2</td>
                <td>Batter goes to 2nd, runners advance 2 bases</td>
              </tr>
              <tr>
                <td>Out</td>
                <td><span class="play-type play-triple">3B</span></td>
                <td>3</td>
                <td>Batter goes to 3rd, runners advance 3 bases</td>
              </tr>
              <tr>
                <td>Out + Docs Back</td>
                <td><span class="play-type play-home_run">HR</span></td>
                <td>4</td>
                <td>Everyone scores! Batter + all runners come home</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rules-section">
        <h2>How Scoring Works</h2>
        <p>This works just like real baseball bases:</p>
        <ul class="rules-list">
          <li>When you log a hit, the batter and all existing runners advance by the number of bases for that hit type.</li>
          <li>Any runner who reaches or passes home plate (4th base) scores a <strong>run</strong> for the team.</li>
          <li>There are no outs or innings — the bases only clear when runners score.</li>
        </ul>

        <h3>Examples</h3>
        <ul class="rules-list">
          <li><strong>Single with bases empty:</strong> Batter goes to 1st. No runs.</li>
          <li><strong>Single with runner on 3rd:</strong> Runner on 3rd scores! 1 run. Batter goes to 1st.</li>
          <li><strong>Double with bases loaded:</strong> Runners on 2nd and 3rd score! 2 runs.</li>
          <li><strong>Home Run with bases loaded (Grand Slam):</strong> Everyone scores! 4 runs.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>How to Log an Event</h2>
        <ol class="rules-list">
          <li>Go to the <strong>Log Event</strong> page (from the nav bar).</li>
          <li>Select your name from the player dropdown.</li>
          <li>Enter the <strong>Lead ID</strong> for the event you completed.</li>
          <li>Click the matching hit button (Single, Double, Triple, or Home Run).</li>
          <li>You'll hear a bat crack and see the result. If runs score, you'll get confetti!</li>
        </ol>
      </div>

      <div class="rules-section">
        <h2>Undo</h2>
        <p>Made a mistake? You can <strong>undo your last event within 2 minutes</strong> of logging it. An "Undo" button will appear below the hit buttons after you log an event. After 2 minutes, only an admin can correct or remove events.</p>
      </div>

      <div class="rules-section">
        <h2>Stats & Tracking</h2>
        <ul class="rules-list">
          <li><strong>Dashboard:</strong> See all team diamonds with live runner positions and scores. Auto-refreshes every 30 seconds. You'll get notified when teams score.</li>
          <li><strong>Team Page:</strong> Click any team's diamond to see player stats and the full event log.</li>
          <li><strong>Leaderboard:</strong> View team standings and individual player stats, sorted by any column.</li>
          <li><strong>History:</strong> Browse past series and see final scores from previous competitions.</li>
          <li><strong>Player Profiles:</strong> Click any player's name to view their career stats, per-series breakdown, and event log.</li>
          <li><strong>Head-to-Head:</strong> Compare two teams side-by-side on the <a href="#/compare" class="table-link">Compare</a> page.</li>
          <li><strong>Export:</strong> Download stats as CSV from the Leaderboard page.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Key Stats</h2>
        <ul class="rules-list">
          <li><strong>Runs (R):</strong> Total runs your team has scored. This is the main team ranking stat.</li>
          <li><strong>Total Bases (TB):</strong> Sum of all bases from your hits. Shows individual production.</li>
          <li><strong>At Bats (AB):</strong> Total events logged.</li>
          <li><strong>AVG (Batting Average):</strong> Hits divided by At Bats. In our game, every event is a hit, so AVG shows how consistently you're logging events. A player with 10 hits in 10 AB has a 1.000 AVG.</li>
          <li><strong>SLG (Slugging Percentage):</strong> Total Bases divided by At Bats. Measures the <em>quality</em> of your hits. A higher SLG means you're logging more valuable production events (doubles, triples, HRs). A player who only hits singles has a 1.000 SLG, while someone averaging doubles has a 2.000 SLG.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Awards</h2>
        <p>When a series ends, awards are automatically calculated and displayed on the series detail page:</p>
        <ul class="rules-list">
          <li><strong>Champion:</strong> Team with the most runs.</li>
          <li><strong>TB Leader:</strong> Player with the most total bases.</li>
          <li><strong>HR Leader:</strong> Player with the most home runs.</li>
          <li><strong>Hustle Award:</strong> Player with the most at-bats (most events logged).</li>
          <li><strong>Best SLG:</strong> Player with the highest slugging percentage (min 5 AB).</li>
          <li><strong>Grand Slam Club:</strong> Players who hit grand slams (4 runs on a single play).</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Roles</h2>
        <ul class="rules-list">
          <li><strong>Player:</strong> Can log events for themselves, undo within 2 minutes, and view all stats.</li>
          <li><strong>Mod:</strong> Can log events for any player on any team.</li>
          <li><strong>Admin:</strong> Full control — manage teams, players, series, edit/delete events, lock series, view audit log, and bulk import players.</li>
        </ul>
      </div>

      ${isAdmin() ? `
      <hr style="margin: 3rem 0; border-color: var(--border);">

      <h1>&#128272; Admin Guide</h1>
      <p style="color:var(--text-muted); margin-bottom: 1.5rem;">This section is only visible to admin accounts.</p>

      <div class="rules-section">
        <h2>Getting Started</h2>
        <p>As an admin, you have full control over the app. Everything is managed from the <a href="#/admin" class="table-link">Admin Panel</a> (the "Admin" link in the nav bar). The panel has tabs for each area: Teams, Players, Series, Tournaments, Events, Audit Log, and Log Event.</p>
      </div>

      <div class="rules-section">
        <h2>Managing Teams</h2>
        <p>Go to <strong>Admin > Teams</strong>.</p>
        <ul class="rules-list">
          <li><strong>Create a team:</strong> Type a team name and click "Add Team." An invite code is generated automatically (e.g. <code>ABC123</code>).</li>
          <li><strong>Share invite codes:</strong> Give each team's invite code to its players so they can self-register at the sign-up page.</li>
          <li><strong>Delete a team:</strong> Click "Delete" next to the team. This will remove the team and unlink its players.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Managing Players</h2>
        <p>Go to <strong>Admin > Players</strong>.</p>
        <ul class="rules-list">
          <li><strong>Add a player manually:</strong> Fill in display name, username, password, team, and role, then click "Add Player."</li>
          <li><strong>Bulk import:</strong> Paste CSV lines in the format <code>display_name,username,team_id,password</code>. Password is optional and defaults to the username if omitted.</li>
          <li><strong>Assign/remove captains:</strong> Click "Make Captain" or "Remove Captain" next to a player. Captains can send and accept challenges on behalf of their team.</li>
          <li><strong>Deactivate a player:</strong> Click "Deactivate" to prevent them from logging in. They'll appear greyed out in the list.</li>
          <li><strong>Roles:</strong>
            <ul>
              <li><em>Player</em> — can log events for themselves and undo within 2 minutes.</li>
              <li><em>Mod</em> — can log events for any player on any team and moderate chat.</li>
              <li><em>Admin</em> — full access to everything.</li>
            </ul>
          </li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Managing Series</h2>
        <p>Go to <strong>Admin > Series</strong>. A series is a competition period (typically a week).</p>
        <ul class="rules-list">
          <li><strong>Create a series:</strong> Enter a name, start date, and end date. The new series becomes active immediately.</li>
          <li><strong>End a series:</strong> Click "End Series" to mark it inactive. Awards are automatically calculated and shown on the series detail page.</li>
          <li><strong>Lock a series:</strong> Click "Lock" to prevent any new events from being logged for that series. Useful once results are final.</li>
          <li><strong>Delete a series:</strong> Permanently removes the series and ALL its data (events, base states, etc.). This cannot be undone.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Managing Tournaments</h2>
        <p>Go to <strong>Admin > Tournaments</strong>. Tournaments are round-robin competitions within a series.</p>
        <ol class="rules-list">
          <li><strong>Create a tournament:</strong> Give it a name, pick the series it belongs to, and set start/end dates.</li>
          <li><strong>Generate the schedule:</strong> Click "Setup Schedule" on a draft tournament. Check the teams to include, set days between rounds, and optionally set a default game time. Click "Generate Schedule" to auto-create all matchups.</li>
          <li><strong>Activate:</strong> Click "Activate" to make the tournament live. Games will appear on the Schedule page.</li>
          <li><strong>Complete:</strong> Click "Complete" when the tournament is finished. Final standings are locked in.</li>
        </ol>
      </div>

      <div class="rules-section">
        <h2>Managing Events</h2>
        <p>Go to <strong>Admin > Events</strong>. Shows the 50 most recent production events.</p>
        <ul class="rules-list">
          <li><strong>Edit an event:</strong> Change the hit type dropdown (1B/2B/3B/HR) and click "Save." Game state is recalculated automatically.</li>
          <li><strong>Delete an event:</strong> Click "Delete" to remove it. Base runners and scores are recalculated from scratch.</li>
          <li><strong>Log an event for anyone:</strong> Use the "Log Event" tab to submit events on behalf of any player.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Audit Log</h2>
        <p>Go to <strong>Admin > Audit Log</strong>. Every admin/mod action is recorded here — edits, deletes, undos, and more. Use this to track who did what and when.</p>
      </div>

      <div class="rules-section">
        <h2>Challenges</h2>
        <p>Team captains can challenge other teams to games from the <a href="#/challenges" class="table-link">Challenges</a> page. As an admin, be aware:</p>
        <ul class="rules-list">
          <li>Only captains can send and respond to challenges.</li>
          <li>Challenges expire automatically after the proposed date passes.</li>
          <li>When a challenge is accepted, a game is created automatically on the schedule.</li>
          <li>You assign captains from the Players tab in the Admin Panel.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Spectators</h2>
        <p>Anyone can register as a spectator without an invite code. Spectators can watch live games, use the game chat, and send emoji reactions. They cannot log events or appear on any team. The chat has a built-in profanity filter and rate limit (1 message per 3 seconds). Mods can delete chat messages.</p>
      </div>

      <div class="rules-section">
        <h2>Quick Reference</h2>
        <div class="rules-table-wrapper">
          <table class="stats-table">
            <thead>
              <tr><th>Task</th><th>Where</th></tr>
            </thead>
            <tbody>
              <tr><td>Create a new team</td><td>Admin > Teams > Add Team</td></tr>
              <tr><td>Add players</td><td>Admin > Players > Add or Bulk Import</td></tr>
              <tr><td>Start a new competition week</td><td>Admin > Series > Create Series</td></tr>
              <tr><td>Set up a round-robin</td><td>Admin > Tournaments > Create + Generate Schedule</td></tr>
              <tr><td>Fix a wrong event</td><td>Admin > Events > Edit or Delete</td></tr>
              <tr><td>Make someone a captain</td><td>Admin > Players > Make Captain</td></tr>
              <tr><td>See who did what</td><td>Admin > Audit Log</td></tr>
              <tr><td>Lock results for a week</td><td>Admin > Series > Lock</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
    </div>`;

  document.getElementById('rewalkthrough-btn')?.addEventListener('click', () => showOnboarding());
}
