---
title: "TrueSkill Skill Rating System"
excerpt: "TrueSkill is a skill rating for games that generalises the popular Elo rating system known from chess to include uncertainty estimates of player ratings, to allow for estimating individual ratings from team outcomes even with more than two teams. TrueSkill was first used in the Xbox 360 title [Halo 3](https://en.wikipedia.org/wiki/Halo_3) and has since been used by a variety of Xbox 360 titles.<br/><img src='/images/TrueSkill-Factor-Graph.png'>"
collection: portfolio
---
The TrueSkill algorithm is described in the NeurIPS paper [TrueSkill(TM): a Bayesian skill rating system](publications/2007-12-03-TrueSkill(TM):-a-Bayesian-skill-rating-system), joint work with [Ralf Herbrich](http://herbrich.me/) and [Tom Minka](https://tminka.github.io/).

You can find more details on the [TrueSkill page at Microsoft Research](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/) and the [TrueSkill Wikipedia page](https://en.wikipedia.org/wiki/TrueSkill). Also, [Mike Moser's excellent blogpost on TrueSkill](http://www.moserware.com/2010/03/computing-your-skill.html) explains all the underlying mathematics necessary to understand it. 

TrueSkill is now textbook material, and, e.g., discussed in Kevin Murphy's excellent textbook [Machine Learning: A Probabilistic Perspective](https://books.google.co.uk/books/about/Machine_Learning.html?id=NZP6AQAAQBAJ) and in David Barber's great book [Bayesian Reasoning and Machine Learning](https://books.google.co.uk/books?id=E7ogAwAAQBAJ&dq=david+barber+trueskill)

We later developed a generalisation of TrueSkill that makes it possible to track players' skills through time, described in the NeurIPS paper [TrueSkill Through Time](https://papers.nips.cc/paper/3331-trueskill-through-time-revisiting-the-history-of-chess). Most notably, it contains a plot of top chess players' skill histories through time.<br/><img src='/images/TrueSkill-History-Of-Chess.png'>
