'use strict';

function runApp() {
  const elems = {
    app: document.querySelector('.app'),
    degreeUnit: document.getElementById('degree-unit'),
    title: document.getElementById('title'),
    weatherDesc: document.getElementById('weather-description'),
    icon: document.getElementById('icon'),
    tempValue: document.getElementById('temp-value')
  };
  let celsius = null;
  let currentUnit = 'C';

  async function checkResponse(response) {
    if (!response.ok) throw new Error('Request failed (' + response.status + ')');
    return response.json();
  }


  async function getWeather(location) {
    const coords = location.coords || location;
    const params = new URLSearchParams({
      lat: coords.latitude,
      lon: coords.longitude
    });
    const data = await checkResponse(await fetch('/current?' + params));
    updateWeather(data);
  }

  function updateWeather(data) {
    const item = data.weather && data.weather[0];
    if (!item || !data.main || !Number.isFinite(Number(data.main.temp))) {
      throw new Error('Unexpected weather response');
    }
    elems.title.textContent = data.name || 'Local weather';
    elems.weatherDesc.textContent = item.main || '';
    if (item.icon) {
      elems.icon.src = item.icon;
      elems.icon.alt = item.description || '';
    }
    celsius = Number(data.main.temp);
    currentUnit = data.sys && data.sys.country === 'US' ? 'F' : 'C';
    renderTemperature();
    elems.app.classList.add('show');
  }

  function renderTemperature() {
    if (celsius === null) return;
    elems.tempValue.textContent = currentUnit === 'F'
      ? String(Math.round(celsius * 9 / 5 + 32))
      : celsius.toFixed(1);
    elems.degreeUnit.textContent = '°' + currentUnit;
  }

  elems.degreeUnit.addEventListener('click', () => {
    currentUnit = currentUnit === 'F' ? 'C' : 'F';
    renderTemperature();
  });

  async function start() {
    if (!navigator.geolocation) {
      elems.title.textContent = 'Location unavailable';
      elems.weatherDesc.textContent = 'Your browser does not support location access.';
      elems.app.classList.add('show');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async location => {
        try {
          await getWeather(location);
        } catch (error) {
          console.error('Weather unavailable:', error);
          elems.title.textContent = 'Weather unavailable';
          elems.weatherDesc.textContent = 'Please try again later.';
          elems.app.classList.add('show');
        }
      },
      error => {
        console.error('Location unavailable:', error);
        elems.title.textContent = 'Location unavailable';
        elems.weatherDesc.textContent = 'Allow location access in your browser and reload this page.';
        elems.app.classList.add('show');
      },
      { timeout: 8000 }
    );
  }

  start();
}
document.addEventListener('DOMContentLoaded', runApp);
