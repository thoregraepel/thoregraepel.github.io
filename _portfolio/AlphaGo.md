---
title: "AlphaGo"
excerpt: "AlphaGo is a computer program developed at DeepMind that plays the board game Go, and was the first computer program to beat a professional Go player - a decade before expected.<br/><img src='/images/TrueSkill-Factor-Graph.png'>"
collection: portfolio
---
I was fortunate to work on the team that created AlphaGo as well as its successors AlphaGoZero and AlphaZero - together with some incredibly talented individuals, and led by the brilliant [David Silver](https://www.davidsilver.uk/).
You can find more details about AlphaGo, its history, and further developments on the [AlphaGo page at DeepMind](https://deepmind.com/research/case-studies/alphago-the-story-so-far) and the [AlphaGo Wikipedia page](https://en.wikipedia.org/wiki/AlphaGo). You can watch me give a very short explanation of how AlphaGo works in the video [How Google Deepmind AlphaGo works](https://www.youtube.com/watch?v=gyBvXDLYFfg).

The original AlphaGo work is described in the paper [Mastering the game of Go with deep neural networks and tree search](publication/2016-01-27-Mastering-the-game-of-Go-with-deep-neural-networks-and-tree-search). In our follow up work, we removed the necessity for human data and other heuristics, resulting in the even stronger player AlphaGoZero described in the paper [Mastering the game of Go without human knowledge](https://thoregraepel.github.io/publication/2017-10-19-Mastering-the-game-of-Go-without-human-knowledge). In order to demonstrate that the methodology was not limited to the game of Go, but extended to other perfect information two player zero-sum games, we developed, AlphaZero, described in the paper [A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play](https://thoregraepel.github.io/publication/2018-12-07-A-general-reinforcement-learning-algorithm-that-masters-chess-shogi-and-Go-through-self-play).

While the work up to this point had assumed that a simulator for the game was available, we recently extended AlphaZero to be able to estimate the transition model and rewards of a game, resulting in the MuZero algorithm described in the paper [Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model](https://arxiv.org/abs/1911.08265). To demonstrate this new modelling capability, we show strong results on Atari games - a benchmark first introduced in the [Arcade Learning Environment](https://arxiv.org/abs/1207.4708).

The wonderful director [Greg Kohs](https://www.reelasdirt.com/gregkohs) made a wonderful feature-film length documentary about AlphaGo and its historic matches against Fang Hui and Lee Sedol, which is available on Youtube - [AlphaGo](https://www.youtube.com/watch?v=WXuK6gekU1Y). Watching it always makes me relive those incredible days in London and Seoul when AlphaGo was developed and made its mark.

The AlphaZero work has inspired a number of books including Max Pumperla's and Kevin Furgeson's [Deep Learning and the Game of Go](https://livebook.manning.com/book/deep-learning-and-the-game-of-go/about-this-book/), for which I had the pleasure of writing the foreword. The book provides a wonderful introduction to the world of deep learning, reinforcement learning and tree search, all based on the game of Go. Also, [Michael Redmond](https://en.wikipedia.org/wiki/Michael_Redmond_(Go_player)), professional 9 dan Go player, and [Chris Garlock](https://www.laborheritage.org/chris-garlocks-biography/), who provided the engaging and competent on-site commentary for the AlphaGo vs Lee Sedol matches in Seoul, have written the book AlphaGo to Zero - The Complete Games, which is available [here](https://gobooks.com/).

There are also some great videos with AlphaGo match commentaries on Youtube - a good starting point is the [Youtube channel of the American Go Association (AGA)](https://www.youtube.com/channel/UCR3qjXCiYEokW7bW3HkFzfg), where Michael and Chris show some great commented games.

For chess fans, there is a wonderful book by [Matthew Sadler](https://en.wikipedia.org/wiki/Matthew_Sadler) and [Natasha Regan](https://www.amazon.co.uk/Natasha-Regan/e/B0034P7H7C) with the title [Game Changer: AlphaZero's Groundbreaking Chess Strategies and the Promise of AI](https://books.google.co.uk/books?id=KhhivwEACAAJ&dq=game+changer&hl=en&sa=X&ved=2ahUKEwiG9tmfipHrAhW0SEEAHXSBB0MQ6AEwCXoECAcQAg). It explores all the new chess knowledge that AlphaZero created, and puts it into the context of the play of human chess masters.

If you prepare videos, there are also some great AlphaZero chess videos on Youtube, for example Matthew Saddler's commentary ["Exactly How to Attack"](https://www.youtube.com/watch?v=bo5plUo86BU). My favourite game is [Alpha Zero's "Immortal Zugzwang Game" against Stockfish](https://www.youtube.com/watch?v=lFXJWPhDsSY&t=702s) - watch until the end!