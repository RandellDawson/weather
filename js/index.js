function runApp() {
  function getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(getWeather, getLocationByIP);
    } else {
      getLocationByIP();
    }
  };

  function checkResponse(response) {
    if (response.ok) {
      return response.json();
    } else {
      const error = {
        'statusText': response.statusText,
        'status': response.status
      }
      throw error;
    }
  }

  function getLocationByIP() {
    const baseUrl = 'https://api.ipgeolocation.io/ipgeo?apiKey=';
    const apiKey = '10d6a9d7232c4e4187c783281e3f82d2';
    fetch(baseUrl + apiKey)
      .then(checkResponse)
      .then(getWeather);
  };

  function getWeather(data) {
    if (data.constructor.name.includes('Position')) {
      data = data.coords;
    }
    const baseUrl = "https://apis.randydawson.com/weather/current?";
    const geoCoordsQS = 'lat=' + data.latitude + '&lon=' + data.longitude;
    fetch(baseUrl + geoCoordsQS)
      .then(checkResponse)
      .then(updateWeather);
  };

  function updateWeather({
      sys: { country },
      name,
      weather,
      main: { temp }
    }) {
    elems.title.innerHTML = name;
    const [{ main: weatherDescription, icon, description } ] = weather;
    elems.weatherDesc.innerHTML =  weatherDescription;
    elems.icon.setAttribute('src', icon);
    elems.icon.setAttribute('alt', description);
    elems.tempValue.setAttribute('data-celcius', temp);
    toggleTemp(country === "US" ? "C" : "F");
    elems.app.classList.add('show');
  };

  function toggleTemp(unit) {
    const celcius = +elems.tempValue.getAttribute('data-celcius');
    unit = elems.degreeUnit.innerHTML.slice(-1) || unit;
    elems.tempValue.innerText = (
      unit === "C" ? Math.round(celcius * 9 / 5 + 32) : celcius.toFixed(1)
    );
    elems.degreeUnit.innerHTML = "&#176;" + (unit === "C" ? "F" : "C");
  };
  
  const elems = {
    app: document.querySelector('.app'),
    degreeUnit: document.getElementById('degree-unit'),
    title: document.getElementById('title'),
    weatherDesc: document.getElementById('weather-description'),
    icon: document.getElementById('icon'),
    tempValue: document.getElementById('temp-value')
  };

  getLocation();
  elems.degreeUnit.addEventListener('click', toggleTemp);
}

document.addEventListener("DOMContentLoaded", runApp);