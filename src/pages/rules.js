import { isLoggedIn } from '../api.js';
import { navigate } from '../router.js';

export async function rulesPage(app) {
  if (!isLoggedIn()) { navigate('/login'); return; }

  app.innerHTML = `
    <div class="container">
      <h1>&#128214; Rules</h1>

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
          <li><strong>RBI (Runs Batted In):</strong> Runs that scored as a result of your specific hits.</li>
          <li><strong>AVG (Batting Average):</strong> Hits divided by At Bats. In our game, every event is a hit, so AVG shows how consistently you're logging events. A player with 10 hits in 10 AB has a 1.000 AVG.</li>
          <li><strong>SLG (Slugging Percentage):</strong> Total Bases divided by At Bats. Measures the <em>quality</em> of your hits. A higher SLG means you're logging more valuable production events (doubles, triples, HRs). A player who only hits singles has a 1.000 SLG, while someone averaging doubles has a 2.000 SLG.</li>
        </ul>
      </div>

      <div class="rules-section">
        <h2>Awards</h2>
        <p>When a series ends, awards are automatically calculated and displayed on the series detail page:</p>
        <ul class="rules-list">
          <li><strong>Champion:</strong> Team with the most runs.</li>
          <li><strong>RBI Leader:</strong> Player who drove in the most runs.</li>
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
    </div>`;
}
