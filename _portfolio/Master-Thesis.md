---
title: "Master Thesis - Uni Project"
excerpt: "The research was focused on multi-modal classification models applied on Twitter data with the aim to detect cyberbullying sentiment out of memes."
collection: portfolio
---
**July 2022**

Cyberbullying and other forms of aggressive conversation on social media have been increasing since the COVID-19 outbreak. This form of content is also depicted in the form of memes, which is a combination of images and text content. Filtering out image-with-text data on social media is more difficult to do since machine learning models can have difficulties detecting the sentiment of the message. This is due to the format in which memes are presented. This research addresses the detection of cyberbullying within image-with-text data that are posted on the Twitter platform. An attempt is done to set up a multi-modal classification model that is capable to analyse the sentiment of the meme and detecting if the content of the Tweet contains cyberbullying content. In comparison to other studies in this field, this research will address the problem specifically focused on image-with-text data in the form of memes that contain these types of content. The purpose of this model would be to serve as an additional filter for detecting harmful content in memes and contribute to the research problem of creating a healthy Twitter environment. The final optimised model manages to retrieve an accuracy score of 91.03 and an F1-score of 66.67.

For this research, I have used the following repositories that were able to detect image-with-text data in the form of memes (credits to Rose and Velioglu (2020) [1] and Muennighoff (2020) [2]):

* [Vilio](https://github.com/Muennighoff/vilio)
* [VisualBERT](https://github.com/rizavelioglu/hateful_memes-hate_detectron)

For more information about the execution, feel free to go to the [Master Thesis repo](https://github.com/Rchou97/master-thesis-2022) on my GitHub profile. There is also the link to the full report.

**References** 
[1] N. Muennighoff (2020), Vilio: State-of-the-art Visio-Linguistic Models applied to Hateful Memes. Retrieved from https://arxiv.org/abs/2012.07788 
[2] R. Velioglu and J. Rose (2020), Detecting Hate Speech in Memes Using Multimodal Deep Learning Approaches: Prize-winning solution to Hateful Memes Challenge. Retrieved from https://arxiv.org/abs/2012.12975.