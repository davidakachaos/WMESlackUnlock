// ==UserScript==
// @name           WME SlackUnlock
// @description    Posts unlock requests to your slack channel
// @namespace      davidakachaos@gmail.com
// @grant          none
// @grant          GM_info
// @version        0.0.6
// @match               https://beta.waze.com/*editor*
// @match               https://www.waze.com/*editor*
// @exclude             https://www.waze.com/*user/*editor/*
// @author         davidakachaos
// @license        Creative Commons Attribution-ShareAlike 4.0 International License
// ==/UserScript==
/* global W, $, JSON*/
var VERSION = GM_info.script.version,
    USERAREAS = [],
    Storage = (function() {
        var slackConfig = (localStorage.slack_config ? JSON.parse(localStorage.slack_config) : {});
        return {
          removeTabConfig: function() {
            delete slackConfig;
            localStorage.slackConfig = JSON.stringify(slackConfig);
          },
          getTabConfig: function() {
            return slackConfig || {};
          },
          exportConfig: function() {
            return JSON.stringify({
              slack_config_token: localStorage.slack_config_token,
              slack_config_channel: localStorage.slack_config_channel
            });
          },
          importConfig: function(toImport) {
            var config = JSON.parse(toImport);
            var iterator = config.entries();
            for (var entry of iterator) {
              if (entry[0].startsWith('slack_config_')) {
                localStorage[entry[0]] = entry[1];
              }
            }
          }
        };
      })();

function initUnlock(e) {
  if (e && e.user == null) {
    return;
  }
  if (typeof I18n === 'undefined') {
    log('No internationalisation object found yet, snoozing');
    setTimeout(initUnlock, 300);
    return;
  }
  if (typeof W === 'undefined' ||
      typeof W.loginManager === 'undefined') {
    setTimeout(initUnlock, 100);
    return;
  }
  if (!W.loginManager.isLoggedIn()) {
    W.loginManager.events.register("login", null, initUnlock);
    W.loginManager.events.register("loginStatus", null, initUnlock);
    return;
  }
  if (typeof W.loginManager.user === 'undefined' ||
      typeof W.loginManager.user.areas === 'undefined') {
    log('Waiting for user areas....');
    setTimeout(initUnlock, 300);
    return;
  }
  log('Initalizing settings...');
  initSettings();
}

function initSettings() {
  var prefsTab = document.querySelector('#sidepanel-prefs');
  if (!prefsTab) {
    log('No settings tab found yet, snoozing');
    setTimeout(initSettings, 400);
    return;
  }
  if(W.loginManager.user.areas)
  log('registering selection changed handler');
  W.selectionManager.events.register('selectionchanged', null, checkLock);
  getUserAreas();
}

function postToSlack(){
  var place = $('.location-info').text().replace(/\,.+$/i, '');
  var post_url = getSlackHook();
  var perma = getPermalink();
  var locked = getLockedAt();
  var user_level = 1 + W.loginManager.getUserRank();

  var reason = $('#unlockReason').val();

  var msg = W.loginManager.user.userName + ': L' + locked + W.model.countries.top.abbr + ' ';
  msg += place + ' -> L' + user_level + ': ' + reason + ' ';
  msg += 'link: ' + perma;

  var payload = {
    text: msg
  }
  var posting = $.post( post_url, JSON.stringify(payload) );
  posting.done(function(data){
    alert('Aanvraag gedaan in Slack!');
  });

}

function getSlackHook(){
  let urls = {
    NL: "https://hooks.slack.com/services/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",
  }
  let selectedSegments = W.selectionManager.getSelectedFeatures();
  let middleSegment = selectedSegments[Math.round((selectedSegments.length - 1) / 2)];
  let country = middleSegment.model.getAddress().attributes.country.abbr;
  if(!urls[country]){
    showMessage("Er is geen Slack WebHook ingesteld voor " + country + "!\nNeem contact op met davidakachaos om deze in te stellen!");
  }
  return urls[country]
}

function getSlackLink(){
  let urls = {
    NL: "https://wazebenelux.slack.com/messages/C04EZ5HDX",
  }
  let selectedSegments = W.selectionManager.getSelectedFeatures();
  let middleSegment = selectedSegments[Math.round((selectedSegments.length - 1) / 2)];
  let country = middleSegment.model.getAddress().attributes.country.abbr;
  if(!urls[country]){
    showMessage("Er is geen Slack link ingesteld voor " + country + "!\nNeem contact op met davidakachaos om deze in te stellen!");
  }
  return urls[country]
}

function getLockedAt(){
  var max_level = 0;
  $.each(W.selectionManager.getSelectedFeatures(), function(indx, section){
    var seg_rank = 1 + section.model.attributes.lockRank;
    if (seg_rank > max_level){
      max_level = seg_rank;
    }
  });
  return max_level;
}

function getSelectedIds(segments){
  let ids = [];
  $.each(segments, function(indx, section){
    ids.push(section.model.attributes.id);
  });
  return ids.join(",");
}

function getLonLat(segment){
  let bounds = segment.model.geometry.bounds;
  return new OL.LonLat(bounds.left, bounds.bottom)
      .transform(W.map.projection, W.map.displayProjection)
}

// returns permalink
function getPermalink() {
  let PL = "";
  let selectedSegments = W.selectionManager.getSelectedFeatures();
  let selectedLength = selectedSegments.length;
  let middleSegment = selectedSegments[Math.round((selectedLength - 1) / 2)];
  let latlon = getLonLat(middleSegment);
  let z = 5;
  if (50 > selectedLength)
    z = 6;
  else if (500 > selectedLength) {
    if (6 > z) z += 1;
  }
  else
    z = 4;
  PL += window.location.origin;
  PL += window.location.pathname;
  PL += '?zoom=';
  PL += z;
  PL += '&lat=';
  PL += latlon.lat;
  PL += '&lon=';
  PL += latlon.lon;
  PL += '&env=';
  PL += W.app.getAppRegionCode();
  PL += '&segments=';
  PL += getSelectedIds(selectedSegments);
  return PL;
}

function getUserAreas(){
  log('Loading editable areas for user');
  for (var a = 0; a < W.loginManager.user.areas.length; a++) {
    for (var c = 0; c < W.loginManager.user.areas[a].geometry.components.length; c++) {
      W.loginManager.user.areas[a].geometry.components[c].calculateBounds();
      USERAREAS.push(W.loginManager.user.areas[a].geometry.components[c]);
    }
  }
}

function isInsideEdiableArea(lon, lat) {
  let lonlat = OL.Layer.SphericalMercator.forwardMercator(lon, lat);
  let xy = new OL.Geometry.Point(lonlat.lon, lonlat.lat);
  let inside = false;
  {
    for (var a = 0; a < USERAREAS.length; a++) {
      if (xy.x >= USERAREAS[a].bounds.left
        && xy.x <= USERAREAS[a].bounds.right
        && xy.y >= USERAREAS[a].bounds.bottom
        && xy.y <= USERAREAS[a].bounds.top
        && USERAREAS[a].containsPoint(xy)) {
        return true;
      }
    }
  }
  return false;
};

function checkEditableArea(){
  let editable = false;
  let selectedSegments = W.selectionManager.getSelectedFeatures();
  for (var i = selectedSegments.length - 1; i >= 0; i--) {
    let segment = selectedSegments[i];
    let lonlat = getLonLat(segment);
    editable = isInsideEdiableArea(lonlat.lon, lonlat.lat);
  }
  return editable;
}

function checkLock(){
  var locked = $('.segment-details .error').size() == 1;
  var max_level = getLockedAt();
  var user_level = 1 + W.loginManager.getUserRank();
  if (locked) {
    log('Segments are locked possibly, checking');
    if(user_level < max_level){
      log('User level lower then the locks, checking if inside editable area');
      if (!checkEditableArea()) {
        log('Segment not in editable area of user, no unlocking possible!');
        return;
      }
      log('Segment locked and inside editable area, adding unlock form.')

      $('#unlockDiv').remove();
      $('#logoSlack').remove();

      let settingsimg = ' data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAMAAABhEH5lAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAn9QTFRF/////////////////////////////////////////////////////vry9NSQ9deY/vz39tym6q4u668y+OS69/z7x+vfyuzh+Pz76qgf7Kgd8sdv7ff31O/11vD1+f3+u+bYSL2XSr2YuebX+OnI3aovvpsbnZ45hsvLc8zfds3ezu3zquDPP7qRPLmQftC26vf4ze30p9vffp1OZ4QYY4UeaLGZbMrfc8zdy+zy0+/nSbuYMayJOqqSecvUdc3fZ6mCYoQaZIMXeKRnnNrlx+ry9/z9+v3+1fD1odzmPKmaGpN8GpJ8TLS3bsrebsvfesG5j5Uss5gb2K9A9/Lit+XteM7ebsrdRrCvGZJ8GJJ7Pamfltjlv+jw4PDu7b1Y66sm996ppd7pccvdcMveaMPMLqKKLKeHT7ub2fHr9diZ6aog6aod8L9q+M3Y8Zi78p2+/Ojw7/n7vufvuubv1O/xccuuQbqTteXV+eTK5pYv3WgW2EEi4Clj4Rhm4Rxo7HSipt/MP7yTPLySfc609NHe856/6VuP1SEqzQ0KzAoL2A9A4BJj4iJr7oKs2uzmUKiPOHZtTUpdyy1u4hZk1w45zAoKzRAK2Co062ub9bbP/fP3/fH286XD5mGUayhSMg42Ngs2nhBQ4xJi4Rxq4TRl2Uwg33QX6KE4++7Y86fE4R1pmA9PNQw2Mg83cSpV52WX9KfG+tze775b6qsj99+t86LB4Rtn4xdlxy9uSUtdOHdtVKiR3uzo9dib6akk6qso9+Gy/e/186HB9dbidcuvO7yRQbyUrOLQ/fnu9tuj9t2o/vrzs+TURbuVR7yWsuPT7vn2iNS7i9W97/n29WExQgAAAAx0Uk5TZuX+01Pq1dfUUf3Qq0UbuQAAAAFiS0dEAIgFHUgAAAAJcEhZcwAAAEgAAABIAEbJaz4AAAEzSURBVBjTY2Bg5AEDXj5+ASDFxMzCwAoR4REUEhYBM9gYeHhExcQleHj4JKWkZWTl5HmYgEIKikrKPDwqqmrqGppa2jw8QCEdXT19A0MjYxNTM3MLS7CQlbWNrZ29uYOjk7OLqxtQyN3D08vbx9fPPyAwKDgEZD5DaFh4RGRUdExsXLxUQiJYKCk5JTUtPSOThycrOyc3L7+gkKGouKS0TK+8goensqq6prauvoEBpLSxqbmlta29o7Oru6e3DyzUP2HipMlTeqZOmz5j5qzZQKE5c+fNX7Bw0eIlS5ctX7ES7K5VqxevWbtu/YaNmzbnbNkKFtq2fcfOXbv37OXh2bf/wEGw0KFth48cPXb8BA/PyVOnzwC9zQ4OkbPnzl+AhhIHAyczF5C+eOnyFbAAFzcnAOAKX8PewslRAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDE2LTAzLTE1VDA2OjAxOjQyLTA1OjAw61QtrAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAxNi0wMy0xNVQwNjowMTo0Mi0wNTowMJoJlRAAAAAASUVORK5CYII=';
      let logoDiv = document.createElement("div");
      logoDiv.id = 'logoSlack'
      logoDiv.style.cssText = 'padding-top:5px;cursor:pointer;float:left;width:18px;height:18px;background-image: url(\''+ settingsimg + '\');';
      logoDiv.onclick = openSlack;


      let unlockDiv = document.createElement("div");
      unlockDiv.id = 'unlockDiv';
      unlockDiv.style.cssText = 'cursor:pointer;padding-top:5px;float:left;'
      unlockDiv.innerHTML = 'Vraag om Unlock in Slack.';

      let mesgReason = document.createElement("div");
      let inputReason = document.createElement("textarea");
      let labelReason = document.createElement("label");
      labelReason.innerHTML = 'Geef een (korte) rede voor de unlock:'
      labelReason.for = 'unlockReason';
      inputReason.id = 'unlockReason';
      inputReason.style.cssText = 'width:265px;height:60px;'

      mesgReason.appendChild(labelReason);
      mesgReason.appendChild(inputReason);

      let btnPostRequest = document.createElement("button");
      btnPostRequest.innerHTML = 'Vraag unlock aan!'
      btnPostRequest.onclick = postToSlack;

      let clear = document.createElement("div");
      clear.style.cssText = 'clear:both;';

      $('.segment-details').append(clear);
      $('.segment-details').append(unlockDiv);
      $('#unlockDiv').append(logoDiv);
      $('#unlockDiv').append(mesgReason);
      $('#unlockDiv').append(btnPostRequest);
      $('.segment-details').append(clear);
    }
  }
}

function openSlack(){
  window.open(getSlackLink(), "_blank");
}

function showMessage(message) {
  alert('WME SlackUnlock\n=============\n' + message);
}

function log(message) {
  if (console.log) {
    console.log('%cWME SlackUnlock(' + GM_info.script.version + '): %c' + message, 'color:black', 'color:#d97e00');
  }
}

log('version - ' + GM_info.script.version);
initUnlock();