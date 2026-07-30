# Thore Graepel — personal site (revamp)

A modern, self-contained static site. **No build step, no dependencies** — just
HTML, CSS, and vanilla JS. Aesthetic: *playful-intellectual*, built around a
Go / games motif. The site is focused on three threads — **Probabilistic
Reasoning**, **AlphaGo**, and **Agents & Robotics** — with the narrative arc
running reasoning → AlphaGo → a new venture applying AlphaGo-style reasoning to
robots. The hero features a 19×19 Go board frozen on AlphaGo's famous **Move 37**
(vs. Lee Sedol, Game 2, 2016); click it or the *replay* button to replay the
opening up to that move.

## Preview locally

Any static file server works. Simplest:

```bash
cd ~/dev/thoregraepel-site
python3 -m http.server 4100
# then open http://localhost:4100
```

## Structure

Sections: hero · About · 01 Reasoning · 02 AlphaGo · 03 Agents & Robotics ·
04 Experiments · 05 Other Work · 06 Talks · 07 Writing · Contact.

```
index.html        # the whole page (single-page site)
css/styles.css    # light + dark themes, games/goban aesthetic, video + callout styles
js/main.js        # 19×19 game board, publication cards, theme toggle, scroll reveal
images/           # profile photo + real paper figures (AlphaGo tree, TrueSkill graphs)
```

- **Publications** are data-driven, grouped by theme: edit the `REASONING`,
  `ALPHAGO`, and `OTHER` arrays in `js/main.js` (rendered into `#pubs-reasoning`,
  `#pubs-alphago`, `#pubs-other`). Each gets a generated "cover" motif, or set
  `cover: "img:images/your-figure.png"` to use a real figure.
- **Videos** are embedded YouTube iframes defined directly in `index.html`:
  Path of Go (Reasoning), Capture the Flag + humanoid football (Agents).
- **The board** is hardcoded in `js/main.js` as the `GAME` array — the full 211
  moves of AlphaGo vs. Lee Sedol, Game 2, transcribed from the SGF. It opens on
  Move 37 (highlighted); "play on" replays the rest, with Go capture rules
  applied so the position stays accurate to the end (B+R).
- **Experiments** cards (seeMusic, MatchProb, Computronium) live in `index.html`
  and link to the deployed demos on GitHub Pages. Note the repo casing:
  `seeMusic/`, `MatchProb/`, but lowercase `computronium/` (the capitalised URL
  404/503s).
- **Dark/light** respects the OS setting and remembers your choice.
- **Responsive**: below 900px the nav collapses to a hamburger dropdown; below
  940px all multi-column layouts (hero, cards, videos) stack to a single column.

## Deploying (later — not done yet)

This is a plain static site, so it drops straight onto GitHub Pages: copy these
files to the root of `thoregraepel.github.io` (replacing the Jekyll site), or push
to a branch and point Pages at it. We'll do this only once you're happy with it.
