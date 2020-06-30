---
title: "Multi-Agent Learning Tutorial"
collection: talks
type: "Tutorial"
permalink: /talks/2018-07-10-Multi-Agent-Learning-Tutorial
venue: "AAMAS/ICML 2018"
date: 2018-07-10
location: "Stockholm, Sweden"
---
[Tutorial Site](https://sites.google.com/site/maltutorial2018/) and [Slides](https://www.karltuyls.net/wp-content/uploads/2020/06/MA-DM-ICML-ACAI.pdf) (or [here](https://thoregraepel.github.io/files/MA-DM-ICML-ACAI.pdf)

Tutorial speakers: David Balduzzi, Thore Graepel, Edward Hughes, Max Jaderberg, Julien Perolat, Karl Tuyls

The tutorial covers topics in learning in multi-agent systems (MAL). We introduce participants to the very basics, assuming elementary knowledge of single-agent reinforcement learning. We revise some game theoretic concepts and then introduce multi-agent learning, which is non-stationary and reflects a moving target problem, considering several paradigms. We continue by introducing the Markov games multi-agent framework, some elementary game-theoretic solution concepts, and links with replicator dynamics from evolutionary game theory. We review some important algorithms from the ‘pre-deep RL’ period, after which we transition to complex systems and delve into deep multi-agent reinforcement learning. We then provide an overview of  recent results from social sequential dilemma’s (SSDs); a newly introduced algorithm (Symplectic Gradient Adjustment, Best Paper Runner Up award ICML 2018) that considers interacting losses arising in games played between deep neural networks, such as GANs; we continue with introductions to the AlphaGo Zero project, an extension of AlphaGo where agents learn from scratch, via pure self play, and we conclude with the emergence of complex multiagent behaviours in the Capture the Flag domain.

After the tutorial, participants should have a basic understanding of the area, knowledge of some of the early and more recent results, an understanding of the state of the art, and know how to potentially enter the field.

* Introduction to multi-agent learning, various paradigms, some game theoretic notions and links between reinforcement learning and evolutionary dynamics
* Basics in Markov Games and normal form games, and how to learn from batch data in these games 
* From learning in stateless games to deep RL in social sequential dilemmas, inequity averse agents 
* Mechanics of interacting losses in differentiable n-player games
* Multi-agent learning in complex domains: AlphaGo, AlphaZero, Capture The Flag
