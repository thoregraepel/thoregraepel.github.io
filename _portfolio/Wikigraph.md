---
title: "Transfer Graph of Wiki pages - University Project"
excerpt: "The goal in this individual project is to develop a scalable program that process the history of Wikipedia pages and generate a temporal similarity graph. The program reads a configuration file at the beginning to set the values of the different parameters that are required, like for example the threshold $th_{sim}$ (similarity of the pages). Since it was difficult to extract all the topics from Wikipedia (my computer would break), I have chosen to go for the pages and version history of the category "Business Intelligence"."
collection: portfolio
---
**June 2021**

This project addresses the problem of modelling the relationship between sets of page histories using a similarity graph. The problem that will be addressed is: what kind of changes have been made throughout the different versions of the sets? And how is it different in comparison to the previous versions of the sets? The page histories with the related references are generated and transformed into a dataframe. Followed up by a Spark program that processes the dataset and calculates the Jaccard distance to showcase the similarity between the sets. The result will be that the data is transformed into a temporal similarity graph. This is to display the different nodes as page versions with the page similarity as the edges between the nodes.

The technologies and libraries that were used for this project were: 

* Python
   * PySpark
   * NumPy
   * Pandas
* Cypher 
   * Neo4J  

For more information about the execution and the findings within the report, feel free to go to the [wikigraph repo](https://https://github.com/Rchou97/wikigraph) on my GitHub profile. 