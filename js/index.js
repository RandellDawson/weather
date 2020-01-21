$(function () {
  function getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(getWeather, getLocationByIP);
    } else {
      getLocationByIP();
    }
  };

  function getLocationByIP() {
    const baseUrl = 'https://api.ipgeolocation.io/ipgeo?apiKey=';
    const apiKey = '10d6a9d7232c4e4187c783281e3f82d2';
    $.ajax(baseUrl + apiKey, { success: getWeather });
  };

  function getWeather(data) {
    if (data.constructor.name.includes('Position')) {
      data = data.coords;
    }
    const baseUrl = "https://apis.randydawson.com/weather/current?";
    const geoCoordsQS = 'lat=' + data.latitude + '&lon=' + data.longitude;
    $.ajax(baseUrl + geoCoordsQS, { success: updateWeather });
  };

  function updateWeather(data) {
    const country = data.sys.country;
    $("#title").html(data.name);
    $("#weather-description").html(data.weather[0].main);
    $("#icon").attr({
      src: data.weather[0].icon,
      alt: data.weather[0].description
    });
    $("#temp-value").attr("data-celcius", data.main.temp);
    toggleTemp(country === "US" ? "C" : "F");
    $("#app").show();
  };

  function toggleTemp(unit) {
    const celcius = +$("#temp-value").attr("data-celcius");
    unit = $("#degree-unit").html().slice(-1) || unit;
    $("#temp-value").text(
      unit === "C" ? Math.round(celcius * 9 / 5 + 32) : celcius.toFixed(1)
    );
    $("#degree-unit").html("&#176;" + (unit === "C" ? "F" : "C"));
  };

  getLocation();
  $("#degree-unit").on("click", toggleTemp);
});