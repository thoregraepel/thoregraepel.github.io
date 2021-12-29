---
title: "Flight Prediction Challenge - Kaggle"
excerpt: "The goal in this Kaggle challenge is to predict the flight delays in the month July. Submissions were evaluated by using the Mean Squared Error (MSE) of the actual values minus the predicted arrival delay values of the machine learning model."
collection: portfolio
---
**December 2021**

The challenge was to predict the ARRIVAL_DELAY column. The training data, test data and some additional datasets were provided. Below, you may find some explanations for some of the data rows:

* YEAR, MONTH, DAY, DAY_OF_WEEK: dates of the flight.
* AIRLINE: an identification number assigned by US DOT to identify a unique airline.
* ORIGIN_AIRPORT, DESTINATION_AIRPORT: code attributed by IATA to identify the airports.
* SCHEDULED_DEPARTURE, SCHEDULED_ARRIVAL: scheduled times of take-off and landing.
* DEPARTURE_TIME: real times at which take-off took place.
* DISTANCE: distance (in miles).

Classification was not appropriate for this context, so that is why we have gone for regression models. We have applied multiple regression models and see the performances of each model if it is suiting within the context of the datasets that we have received. In this case, we have used the following machine learning frameworks from different libraries: 

* [Random forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html)
* [XGBoost](https://xgboost.readthedocs.io/en/stable/python/python_api.html)
* [CatBoost](https://catboost.ai/en/docs/concepts/python-reference_catboostregressor)

When comparing the three models based on computational time, performance in general, and the number of features that was needed to get that performance, it was concluded that CatBoost was the best out of the three models. And then we have tweaked the model to generalise it better on both datasets. 

For more information about the execution, feel free to go to the [flight prediction challenge repo](https://github.com/Rchou97/flight_prediction_challenge) on my GitHub. 