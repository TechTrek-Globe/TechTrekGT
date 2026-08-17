const https = require('https');
const fs = require('fs');

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function testPhotoDownload() {
  const photoName = "places/ChIJ39HZXuVbFkcRFRXjXZ4YujE/photos/AWCwydiM6MLwg3vI80PX9U0s_bM0zeDuqxprT-V5yyxooTZ9HHSX_IPLDC9tX_TXWBmGReoGFXFIytLAAknEIiUYNTta5iHsuaJEP5SQ7QkmNVXsE3MwdzJRsT16fDXo9hs9-LtYKCsjkwwMd766COua-bE3flI9-v66tJb50gE0FtYhVWwLft5QNKeLYekhfSwgdFh--K9r0URIAl8HSwe1VdUY0XU3V84iWrQlyBPDey-q3uBQ4q_8UJvk71aqg1AeKw66MFzkLswpKYqr7iM-yeL0ovFGoQdeXL3NbZX7pAq0j720mZ40GEbDeu9FJos729aFCZWmNz9hFhAqFaoirQxMMaKPQoKrCL0ISgEhisJhAJNBWX9u4sAN8B5ud-VlBGAj5EqbiPOWilHtDjxUr0m_jdOcEAngMLUEG1BAOAHItP_AdbWhHTdkhiV-gatt";
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${API_KEY}`;

  console.log('Testing photo download from Places API (New)...');
  const req = https.get(url, {
    headers: {
      'Referer': 'https://techtrekgt.com/'
    }
  }, (res) => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Headers:', res.headers);
    if (res.statusCode === 302 || res.statusCode === 307) {
      console.log('Redirect URL:', res.headers.location);
      https.get(res.headers.location, (imgRes) => {
        console.log('Image stream status:', imgRes.statusCode, 'Content-Type:', imgRes.headers['content-type'], 'Content-Length:', imgRes.headers['content-length']);
      });
    }
  });

  req.on('error', console.error);
}

testPhotoDownload();
