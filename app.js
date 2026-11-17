/**
 * ============================================================================
 * VELOX GPS & SPEEDOMETER · NAVEGAÇÃO & ALERTA COLABORATIVO (ESTILO WAZE)
 * Sistema completo de velocímetros, GPS e crowdsourcing em tempo real
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. ESTADO GLOBAL DA APLICAÇÃO
  // ==========================================================================
  const State = {
    mode: 'nav', // 'nav' | 'cockpit'
    cockpitTheme: 'digital', // 'digital' | 'analog' | 'hud' | 'cyber'
    hudMirrored: false, // Inicia normal e legível na tela!

    // Velocidades
    currentSpeed: 0, // km/h
    speedLimit: 60, // km/h
    autoDetectLimit: true,

    // Telemetria da Viagem
    maxSpeed: 0,
    speedSum: 0,
    speedCount: 0,
    distanceTraveledKm: 0,
    headingDeg: 0,

    // Geolocalização
    position: {
      lat: -23.561684, // Ponto inicial: Av. Paulista, São Paulo
      lng: -46.655981,
      accuracy: 10,
      heading: 0,
      speed: 0,
      hasRealGps: false
    },
    watchId: null,

    // Áudio e Alertas
    audioMode: 'voice', // 'voice' | 'beep' | 'mute'
    audioCtx: null,
    lastOverspeedAlertTime: 0,
    lastProxAlertId: null,
    lastProxAlertTime: 0,

    // Ocorrências Colaborativas (Crowdsourcing)
    incidents: [],
    selectedIncidentType: 'police',
    selectedIncidentLane: 'any',

    // Navegação Ativa & Rota
    destination: null, // { lat, lng, name, address }
    isNavigating: false,
    routePoints: [],
    routeSteps: [],
    currentStepIndex: 0,
    routeSimIndex: 0,
    wakeLock: null,

    // Simulação Desktop
    isSimulatorActive: false,
    simulatedRoadIndex: 0,
    simInterval: null,

    // Banco de Dados em Tempo Real
    cloudMode: 'local', // 'local' | 'firebase'
    firestoreDb: null
  };

  // Coordenadas de uma rota cênica no Brasil (Av. Paulista -> Consolação -> Rebouças) para teste no simulador
  const SIMULATED_ROUTE = [
    { lat: -23.561684, lng: -46.655981, road: "Av. Paulista", limit: 50 },
    { lat: -23.563120, lng: -46.654210, road: "Av. Paulista - Altura MASP", limit: 50 },
    { lat: -23.565810, lng: -46.650890, road: "Av. Paulista - Gazeta", limit: 50 },
    { lat: -23.568430, lng: -46.647710, road: "Av. Bernardino de Campos", limit: 50 },
    { lat: -23.575210, lng: -46.643210, road: "Av. 23 de Maio (Corredor Norte-Sul)", limit: 70 },
    { lat: -23.582400, lng: -46.640100, road: "Av. 23 de Maio - Altura Ibirapuera", limit: 70 },
    { lat: -23.595100, lng: -46.638500, road: "Av. Rubem Berta", limit: 70 },
    { lat: -23.612000, lng: -46.645000, road: "Av. dos Bandeirantes", limit: 60 },
    { lat: -23.630000, lng: -46.660000, road: "Rodovia dos Imigrantes", limit: 110 }
  ];

  // Ocorrências Iniciais Pré-carregadas (Demonstração da Comunidade)
  const INITIAL_INCIDENTS = [
    {
      id: 'inc-1',
      type: 'radar',
      title: 'Radar de Velocidade (60 km/h)',
      icon: '📸',
      lat: -23.563820,
      lng: -46.653410,
      road: 'Av. Paulista',
      lane: 'Todas',
      timeText: 'Reportado há 4 min',
      timestamp: Date.now() - 240000,
      votesUp: 12,
      votesDown: 0,
      soundText: 'Atenção: Radar de velocidade à frente'
    },
    {
      id: 'inc-2',
      type: 'pothole',
      title: 'Buraco na Faixa da Direita',
      icon: '🕳️',
      lat: -23.567200,
      lng: -46.649200,
      road: 'Av. Paulista - Pista Centro',
      lane: 'Direita',
      timeText: 'Reportado há 12 min',
      timestamp: Date.now() - 720000,
      votesUp: 8,
      votesDown: 1,
      soundText: 'Cuidado: Buraco na via'
    },
    {
      id: 'inc-3',
      type: 'police',
      title: 'Fiscalização Policial / Blitz',
      icon: '🚔',
      lat: -23.578000,
      lng: -46.641500,
      road: 'Av. 23 de Maio',
      lane: 'Acostamento',
      timeText: 'Reportado há 8 min',
      timestamp: Date.now() - 480000,
      votesUp: 19,
      votesDown: 2,
      soundText: 'Atenção: Fiscalização policial na pista'
    }
  ];

  // ==========================================================================
  // 2. REFERÊNCIAS AO DOM
  // ==========================================================================
  const UI = {
    // Header & Modos
    gpsStatusText: document.getElementById('gpsStatusText'),
    tabNav: document.getElementById('tabNav'),
    tabCockpit: document.getElementById('tabCockpit'),
    viewNav: document.getElementById('viewNav'),
    viewCockpit: document.getElementById('viewCockpit'),

    // Controles de Áudio & Nuvem
    btnAudioToggle: document.getElementById('btnAudioToggle'),
    audioIcon: document.getElementById('audioIcon'),
    audioLabel: document.getElementById('audioLabel'),
    btnCloudModal: document.getElementById('btnCloudModal'),
    cloudDot: document.getElementById('cloudDot'),
    cloudLabel: document.getElementById('cloudLabel'),

    // Proximidade
    proximityBanner: document.getElementById('proximityBanner'),
    proxIconBox: document.getElementById('proxIconBox'),
    proxBadge: document.getElementById('proxBadge'),
    proxTime: document.getElementById('proxTime'),
    proxTitle: document.getElementById('proxTitle'),
    proxSub: document.getElementById('proxSub'),
    btnDismissProx: document.getElementById('btnDismissProx'),

    // Busca & Destinos
    searchDestWrapper: document.getElementById('searchDestWrapper'),
    inputDestination: document.getElementById('inputDestination'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    btnSearchGo: document.getElementById('btnSearchGo'),
    quickChips: document.querySelectorAll('.quick-chip'),
    searchResultsDropdown: document.getElementById('searchResultsDropdown'),
    resultsListContainer: document.getElementById('resultsListContainer'),

    // Prévia de Rota
    routePreviewCard: document.getElementById('routePreviewCard'),
    previewDestTitle: document.getElementById('previewDestTitle'),
    previewDestSub: document.getElementById('previewDestSub'),
    routeTimeEst: document.getElementById('routeTimeEst'),
    routeDistEst: document.getElementById('routeDistEst'),
    routeEtaEst: document.getElementById('routeEtaEst'),
    btnStartNavigation: document.getElementById('btnStartNavigation'),
    btnClosePreview: document.getElementById('btnClosePreview'),

    // Manobra Ativa
    activeManeuverBanner: document.getElementById('activeManeuverBanner'),
    maneuverIcon: document.getElementById('maneuverIcon'),
    maneuverDist: document.getElementById('maneuverDist'),
    maneuverStreet: document.getElementById('maneuverStreet'),
    btnStopNav: document.getElementById('btnStopNav'),

    // Modo Mapa
    roadHud: document.getElementById('roadHud'),
    currentRoadName: document.getElementById('currentRoadName'),
    roadTypeTag: document.getElementById('roadTypeTag'),
    roadPavementTag: document.getElementById('roadPavementTag'),
    roadDirectionTag: document.getElementById('roadDirectionTag'),
    speedLimitSign: document.getElementById('speedLimitSign'),
    signSpeedValue: document.getElementById('signSpeedValue'),
    navSpeedNumber: document.getElementById('navSpeedNumber'),
    navSpeedStatus: document.getElementById('navSpeedStatus'),
    btnRecenter: document.getElementById('btnRecenter'),
    btnCompass: document.getElementById('btnCompass'),
    btnOpenReportModal: document.getElementById('btnOpenReportModal'),

    // Cockpit
    themePills: document.querySelectorAll('.theme-pill'),
    gaugeDisplays: document.querySelectorAll('.gauge-display'),
    displayDigital: document.getElementById('displayDigital'),
    displayAnalog: document.getElementById('displayAnalog'),
    displayHud: document.getElementById('displayHud'),
    displayCyber: document.getElementById('displayCyber'),

    // Elementos Digital
    digitalArcProgress: document.getElementById('digitalArcProgress'),
    cockpitSignSpeed: document.getElementById('cockpitSignSpeed'),
    cockpitSpeedNumber: document.getElementById('cockpitSpeedNumber'),
    cockpitSpeedTag: document.getElementById('cockpitSpeedTag'),

    // Elementos Analógico
    analogTicksGroup: document.getElementById('analogTicksGroup'),
    analogNeedleGroup: document.getElementById('analogNeedleGroup'),
    analogDigitalVal: document.getElementById('analogDigitalVal'),
    analogRedLine: document.getElementById('analogRedLine'),

    // Elementos HUD Noturno
    hudMirrorBox: document.getElementById('hudMirrorBox'),
    hudSpeedDigits: document.getElementById('hudSpeedDigits'),
    hudLimitValue: document.getElementById('hudLimitValue'),
    btnToggleMirror: document.getElementById('btnToggleMirror'),

    // Elementos Cyber
    cyberSpeedNum: document.getElementById('cyberSpeedNum'),
    cyberPowerFill: document.getElementById('cyberPowerFill'),
    cyberStatusVal: document.getElementById('cyberStatusVal'),
    cyberLimitVal: document.getElementById('cyberLimitVal'),

    // Telemetria Rodapé
    telemetryMax: document.getElementById('telemetryMax'),
    telemetryAvg: document.getElementById('telemetryAvg'),
    telemetryHeading: document.getElementById('telemetryHeading'),
    telemetryDistance: document.getElementById('telemetryDistance'),

    // Simulador Desktop
    simulatorBar: document.getElementById('simulatorBar'),
    btnToggleSim: document.getElementById('btnToggleSim'),
    btnCloseSim: document.getElementById('btnCloseSim'),
    simSpeedSlider: document.getElementById('simSpeedSlider'),
    simSpeedDisplay: document.getElementById('simSpeedDisplay'),
    btnSimAcc10: document.getElementById('btnSimAcc10'),
    btnSimAcc50: document.getElementById('btnSimAcc50'),
    btnSimAcc80: document.getElementById('btnSimAcc80'),
    btnSimAcc120: document.getElementById('btnSimAcc120'),
    btnSimBrake: document.getElementById('btnSimBrake'),
    btnSimTriggerIncident: document.getElementById('btnSimTriggerIncident'),

    // Modais
    modalReport: document.getElementById('modalReport'),
    btnCloseReportModal: document.getElementById('btnCloseReportModal'),
    btnCancelReport: document.getElementById('btnCancelReport'),
    btnSubmitReport: document.getElementById('btnSubmitReport'),
    incidentButtons: document.querySelectorAll('.incident-btn'),
    laneTags: document.querySelectorAll('.lane-tag'),

    modalSpeedLimit: document.getElementById('modalSpeedLimit'),
    btnCloseSpeedModal: document.getElementById('btnCloseSpeedModal'),
    btnConfirmSpeedLimit: document.getElementById('btnConfirmSpeedLimit'),
    signPickButtons: document.querySelectorAll('.sign-pick-btn'),
    chkAutoDetectLimit: document.getElementById('chkAutoDetectLimit'),

    modalCloud: document.getElementById('modalCloud'),
    btnCloseCloudModal: document.getElementById('btnCloseCloudModal'),
    btnConfirmCloudModal: document.getElementById('btnConfirmCloudModal'),
    firebaseConfigInput: document.getElementById('firebaseConfigInput'),
    btnConnectFirebase: document.getElementById('btnConnectFirebase'),
    btnResetFirebase: document.getElementById('btnResetFirebase'),
    cloudStatusTitle: document.getElementById('cloudStatusTitle'),
    cloudStatusDesc: document.getElementById('cloudStatusDesc'),

    modalVerify: document.getElementById('modalVerify'),
    verifyIncidentIcon: document.getElementById('verifyIncidentIcon'),
    verifyIncidentTitle: document.getElementById('verifyIncidentTitle'),
    verifyIncidentDesc: document.getElementById('verifyIncidentDesc'),
    btnVerifyYes: document.getElementById('btnVerifyYes'),
    btnVerifyNo: document.getElementById('btnVerifyNo')
  };

  // ==========================================================================
  // 3. MOTOR DE ÁUDIO & VOZ SINTETIZADA (WEB AUDIO API)
  // ==========================================================================
  const AudioEngine = {
    init() {
      if (!State.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          State.audioCtx = new AudioContextClass();
        }
      }
      if (State.audioCtx && State.audioCtx.state === 'suspended') {
        State.audioCtx.resume();
      }
    },

    // Emite bipes customizados com curvas suaves de ganho
    playBeep(frequency = 880, duration = 0.15, type = 'sine') {
      if (State.audioMode === 'mute') return;
      this.init();
      if (!State.audioCtx) return;

      try {
        const osc = State.audioCtx.createOscillator();
        const gain = State.audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, State.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.01, State.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, State.audioCtx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, State.audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(State.audioCtx.destination);

        osc.start();
        osc.stop(State.audioCtx.currentTime + duration);
      } catch (e) {
        console.warn('AudioContext error:', e);
      }
    },

    // Alerta de excesso de velocidade (dois bipes rápidos agudos)
    playOverspeedChime() {
      if (State.audioMode === 'mute') return;
      this.playBeep(980, 0.12, 'triangle');
      setTimeout(() => {
        this.playBeep(1200, 0.16, 'triangle');
      }, 140);
    },

    // Alerta de aproximação de ocorrência (três notas harmônicas ascendentes)
    playIncidentChime() {
      if (State.audioMode === 'mute') return;
      this.playBeep(523.25, 0.1, 'sine'); // C5
      setTimeout(() => this.playBeep(659.25, 0.1, 'sine'), 110); // E5
      setTimeout(() => this.playBeep(783.99, 0.18, 'sine'), 220); // G5
    },

    // Fala por voz sintetizada em Português do Brasil (PT-BR)
    speak(phrase) {
      if (State.audioMode === 'mute' || State.audioMode === 'beep') return;
      if (!('speechSynthesis' in window)) return;

      try {
        window.speechSynthesis.cancel(); // Evita fila acumulada
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.08;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis error:', err);
      }
    }
  };

  // ==========================================================================
  // 4. MAPA OPENSTREETMAP (LEAFLET) & VEÍCULO
  // ==========================================================================
  let MapEngine = {
    leafletMap: null,
    carMarker: null,
    incidentMarkersGroup: null,

    init() {
      if (typeof L === 'undefined') {
        console.warn('Leaflet ainda não carregado.');
        return;
      }

      // Inicializa o mapa centralizado em São Paulo / Av. Paulista
      this.leafletMap = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([State.position.lat, State.position.lng], 16);

      // Camada de Tiles do OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.leafletMap);

      // Grupo de Marcadores de Ocorrências
      this.incidentMarkersGroup = L.layerGroup().addTo(this.leafletMap);

      // Marcador do Veículo do Usuário
      const carIcon = L.divIcon({
        className: 'car-icon-wrapper',
        html: `
          <div class="custom-car-marker" id="leafletCarMarker">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <polygon points="12,2 22,21 12,17 2,21"></polygon>
            </svg>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      this.carMarker = L.marker([State.position.lat, State.position.lng], { icon: carIcon }).addTo(this.leafletMap);

      // Renderiza as ocorrências no mapa
      this.renderIncidents();
    },

    updateCarPosition(lat, lng, heading = 0) {
      if (!this.leafletMap || !this.carMarker) return;
      this.carMarker.setLatLng([lat, lng]);

      const carEl = document.getElementById('leafletCarMarker');
      if (carEl) {
        carEl.style.transform = `rotate(${heading}deg)`;
      }

      this.leafletMap.panTo([lat, lng], { animate: true, duration: 0.6 });
    },

    renderIncidents() {
      if (!this.incidentMarkersGroup) return;
      this.incidentMarkersGroup.clearLayers();

      State.incidents.forEach(inc => {
        const markerIcon = L.divIcon({
          className: 'incident-icon-wrapper',
          html: `
            <div class="custom-incident-marker" title="${inc.title}">
              <span>${inc.icon}</span>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const marker = L.marker([inc.lat, inc.lng], { icon: markerIcon });
        marker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 170px; color: #111;">
            <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">${inc.icon} ${inc.title}</div>
            <div style="font-size: 12px; color: #555;">${inc.road} (${inc.lane})</div>
            <div style="font-size: 11px; color: #888; margin: 4px 0 8px;">${inc.timeText}</div>
            <div style="font-size: 12px; font-weight: 700; color: #0284c7;">👍 ${inc.votesUp} confirmações</div>
          </div>
        `);

        this.incidentMarkersGroup.addLayer(marker);
      });
    },

    recenter() {
      if (this.leafletMap) {
        this.leafletMap.setView([State.position.lat, State.position.lng], 16, { animate: true });
      }
    },

    routeLineGlow: null,
    routeLineCore: null,
    destinationMarker: null,

    drawRoute(latLngs, dest) {
      this.clearRouteLayers();

      // Linha de contorno / brilho externo da rota
      this.routeLineGlow = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 10,
        opacity: 0.5,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.leafletMap);

      // Linha central luminosa neon
      this.routeLineCore = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.leafletMap);

      // Marcador do Destino com bandeira de chegada
      const destIcon = L.divIcon({
        className: 'dest-icon-wrapper',
        html: `
          <div class="custom-destination-marker" title="${dest.name}">
            <span>🏁</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      this.destinationMarker = L.marker([dest.lat, dest.lng], { icon: destIcon }).addTo(this.leafletMap);

      // Ajusta enquadramento do mapa para exibir toda a rota
      const bounds = L.latLngBounds(latLngs);
      this.leafletMap.fitBounds(bounds, { padding: [80, 80] });
    },

    clearRouteLayers() {
      if (this.routeLineGlow && this.leafletMap) {
        this.leafletMap.removeLayer(this.routeLineGlow);
        this.routeLineGlow = null;
      }
      if (this.routeLineCore && this.leafletMap) {
        this.leafletMap.removeLayer(this.routeLineCore);
        this.routeLineCore = null;
      }
      if (this.destinationMarker && this.leafletMap) {
        this.leafletMap.removeLayer(this.destinationMarker);
        this.destinationMarker = null;
      }
    }
  };

  // ==========================================================================
  // 5. MOTOR DE CROWDSOURCING & BANCO DE DADOS EM TEMPO REAL
  // ==========================================================================
  const CloudEngine = {
    init() {
      // 1. Tenta carregar configuração salva do Firebase
      const savedFirebase = localStorage.getItem('velox_firebase_config');
      if (savedFirebase) {
        try {
          const cfg = JSON.parse(savedFirebase);
          this.connectFirebase(cfg, false);
          return;
        } catch (e) {
          console.warn('Erro ao restaurar Firebase:', e);
        }
      }

      // 2. Modo Simulado / Local
      this.initLocalMode();
    },

    initLocalMode() {
      State.cloudMode = 'local';
      UI.cloudDot.className = 'cloud-dot online';
      UI.cloudLabel.textContent = 'Modo Simulado';
      UI.cloudStatusTitle.textContent = 'Modo Simulado / Demonstração Ativo';
      UI.cloudStatusDesc.textContent = 'Os alertas que você reportar são salvos na memória e geram reações imediatas na tela. Para conectar múltiplos celulares reais simultaneamente pela internet, basta colar suas chaves gratuitas do Firebase abaixo.';

      // Carrega do localStorage ou dados padrão
      const savedLocal = localStorage.getItem('velox_local_incidents');
      if (savedLocal) {
        try {
          State.incidents = JSON.parse(savedLocal);
        } catch (e) {
          State.incidents = [...INITIAL_INCIDENTS];
        }
      } else {
        State.incidents = [...INITIAL_INCIDENTS];
      }

      MapEngine.renderIncidents();
    },

    connectFirebase(configObj, showAlert = true) {
      if (typeof firebase === 'undefined') {
        alert('A biblioteca do Firebase não foi encontrada. Verifique sua conexão à internet.');
        return;
      }

      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(configObj);
        }
        State.firestoreDb = firebase.firestore();
        State.cloudMode = 'firebase';

        localStorage.setItem('velox_firebase_config', JSON.stringify(configObj));

        UI.cloudDot.className = 'cloud-dot firebase';
        UI.cloudLabel.textContent = 'Firebase Nuvem';
        UI.cloudStatusTitle.textContent = 'Conectado à Nuvem do Firebase!';
        UI.cloudStatusDesc.textContent = 'Sua rede está 100% online. Qualquer ocorrência marcada neste aparelho surgirá na tela de outros celulares conectados.';

        // Listener em Tempo Real (onSnapshot)
        State.firestoreDb.collection('velox_incidents')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
              list.push({ id: doc.id, ...doc.data() });
            });
            if (list.length > 0) {
              State.incidents = list;
            } else {
              State.incidents = [...INITIAL_INCIDENTS];
            }
            MapEngine.renderIncidents();
          }, err => {
            console.error('Erro no snapshot do Firestore:', err);
          });

        if (showAlert) {
          alert('Conectado ao Firebase com sucesso! O aplicativo agora compartilha alertas com todos os usuários em tempo real.');
        }
      } catch (err) {
        console.error('Falha ao conectar ao Firebase:', err);
        alert('Falha na configuração do Firebase: ' + err.message);
      }
    },

    addIncident(incidentData) {
      // 1. Atualização Otimista no Estado Local
      State.incidents.unshift(incidentData);
      MapEngine.renderIncidents();

      // 2. Persistência
      if (State.cloudMode === 'firebase' && State.firestoreDb) {
        State.firestoreDb.collection('velox_incidents').add(incidentData)
          .then(docRef => {
            incidentData.id = docRef.id;
          })
          .catch(err => {
            console.error('Erro ao gravar no Firestore:', err);
          });
      } else {
        localStorage.setItem('velox_local_incidents', JSON.stringify(State.incidents));
      }
    }
  };

  // ==========================================================================
  // 6. MOTOR DE GEOFENCING & ALERTA DE PROXIMIDADE (ESTILO WAZE)
  // ==========================================================================
  const ProximityEngine = {
    // Fórmula de Haversine para calcular distância precisa em metros entre duas coordenadas
    calculateDistanceMeters(lat1, lon1, lat2, lon2) {
      const R = 6371e3; // Raio da Terra em metros
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    },

    checkProximity() {
      const now = Date.now();
      let closestIncident = null;
      let minDistance = Infinity;

      State.incidents.forEach(inc => {
        const dist = this.calculateDistanceMeters(
          State.position.lat,
          State.position.lng,
          inc.lat,
          inc.lng
        );

        if (dist < minDistance) {
          minDistance = dist;
          closestIncident = inc;
        }
      });

      // Se estiver a menos de 500 metros de uma ocorrência
      if (closestIncident && minDistance <= 500) {
        this.showProximityAlert(closestIncident, Math.round(minDistance));

        // Toca o som apenas se for um novo incidente ou se já passou mais de 20s
        if (State.lastProxAlertId !== closestIncident.id || (now - State.lastProxAlertTime > 20000)) {
          State.lastProxAlertId = closestIncident.id;
          State.lastProxAlertTime = now;

          AudioEngine.playIncidentChime();
          const distInt = Math.round(minDistance / 50) * 50; // Arredonda para 400m, 350m...
          const phrase = `${closestIncident.soundText} a ${distInt > 0 ? distInt : 100} metros`;
          setTimeout(() => AudioEngine.speak(phrase), 400);
        }

        // Se estiver muito perto (menos de 60 metros), sugere a validação ("Ainda está aqui?")
        if (minDistance <= 60 && !closestIncident.verifiedThisTrip) {
          closestIncident.verifiedThisTrip = true;
          this.promptVerification(closestIncident);
        }
      } else {
        // Se afastou de todas as ocorrências
        if (!UI.proximityBanner.hasAttribute('hidden') && minDistance > 650) {
          UI.proximityBanner.setAttribute('hidden', '');
        }
      }
    },

    showProximityAlert(incident, distanceMeters) {
      UI.proximityBanner.removeAttribute('hidden');
      UI.proxIconBox.textContent = incident.icon;
      UI.proxBadge.textContent = `ALERTA A ${distanceMeters}M`;
      UI.proxTime.textContent = incident.timeText || 'Recentemente';
      UI.proxTitle.textContent = incident.title;
      UI.proxSub.textContent = `${incident.road} · Faixa: ${incident.lane || 'Todas'}`;

      // Aplica classes de cor de acordo com o tipo
      UI.proximityBanner.className = 'proximity-banner';
      if (incident.type === 'police') {
        UI.proximityBanner.classList.add('police');
      } else if (incident.type === 'pothole' || incident.type === 'hazard') {
        UI.proximityBanner.classList.add('warning');
      }
    },

    promptVerification(incident) {
      UI.verifyIncidentIcon.textContent = incident.icon;
      UI.verifyIncidentTitle.textContent = incident.title;
      UI.verifyIncidentDesc.textContent = `Você passou pelo ponto marcado em ${incident.road}. A ocorrência ainda está no local?`;
      UI.modalVerify.removeAttribute('hidden');

      // Botão Sim
      UI.btnVerifyYes.onclick = () => {
        incident.votesUp = (incident.votesUp || 0) + 1;
        UI.modalVerify.setAttribute('hidden', '');
        MapEngine.renderIncidents();
        AudioEngine.speak('Obrigado por confirmar!');
      };

      // Botão Não
      UI.btnVerifyNo.onclick = () => {
        incident.votesDown = (incident.votesDown || 0) + 1;
        UI.modalVerify.setAttribute('hidden', '');
        if (incident.votesDown >= 2) {
          // Remove o alerta do mapa se 2 pessoas confirmarem que acabou
          State.incidents = State.incidents.filter(item => item.id !== incident.id);
          MapEngine.renderIncidents();
          AudioEngine.speak('Ocorrência removida do mapa.');
        }
      };
    }
  };

  // ==========================================================================
  // 7. MOTOR DO VELOCÍMETRO (GAUGES & TEMAS)
  // ==========================================================================
  const SpeedometerEngine = {
    init() {
      this.generateAnalogTicks();
    },

    // Cria as marcações circulares e numerais de 0 a 240 km/h no tema analógico
    generateAnalogTicks() {
      if (!UI.analogTicksGroup) return;
      UI.analogTicksGroup.innerHTML = '';

      const cx = 170;
      const cy = 170;
      const r = 135;
      const totalSpeed = 240;
      const startAngle = -120; // 0 km/h
      const endAngle = 120; // 240 km/h
      const angleRange = endAngle - startAngle;

      for (let s = 0; s <= totalSpeed; s += 10) {
        const angle = startAngle + (s / totalSpeed) * angleRange;
        const rad = (angle - 90) * (Math.PI / 180);
        const isMajor = s % 20 === 0;
        const tickLen = isMajor ? 12 : 6;

        const x1 = cx + (r - tickLen) * Math.cos(rad);
        const y1 = cy + (r - tickLen) * Math.sin(rad);
        const x2 = cx + r * Math.cos(rad);
        const y2 = cy + r * Math.sin(rad);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', `analog-tick-line ${isMajor ? 'major' : ''}`);
        UI.analogTicksGroup.appendChild(line);

        // Numerais a cada 20 km/h
        if (isMajor) {
          const textR = r - 24;
          const tx = cx + textR * Math.cos(rad);
          const ty = cy + textR * Math.sin(rad);

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', tx);
          text.setAttribute('y', ty);
          text.setAttribute('class', 'analog-tick-text');
          text.textContent = s;
          UI.analogTicksGroup.appendChild(text);
        }
      }
    },

    update(speedKmH) {
      const speed = Math.max(0, Math.round(speedKmH));
      const limit = State.speedLimit;
      const isOverspeed = speed > limit;
      const isNearLimit = speed >= limit - 5 && speed <= limit;

      // 1. Atualiza Leituras Numéricas Gerais
      UI.navSpeedNumber.textContent = speed;
      UI.cockpitSpeedNumber.textContent = speed;
      UI.analogDigitalVal.textContent = speed;
      UI.hudSpeedDigits.textContent = speed;
      UI.cyberSpeedNum.textContent = speed;

      // 2. Status Pills e Tags
      if (isOverspeed) {
        UI.navSpeedStatus.className = 'speed-status-pill overspeed';
        UI.navSpeedStatus.textContent = 'EXCESSO DE VELOCIDADE!';
        UI.cockpitSpeedTag.className = 'cockpit-status-tag overspeed';
        UI.cockpitSpeedTag.textContent = '⚠️ ACIMA DO LIMITE!';
        UI.cyberStatusVal.className = 'stat-value alert';
        UI.cyberStatusVal.textContent = 'EXCESSO!';
      } else if (isNearLimit) {
        UI.navSpeedStatus.className = 'speed-status-pill warning';
        UI.navSpeedStatus.textContent = 'PERTO DO LIMITE';
        UI.cockpitSpeedTag.className = 'cockpit-status-tag safe';
        UI.cockpitSpeedTag.textContent = 'ATENÇÃO AO LIMITE';
        UI.cyberStatusVal.className = 'stat-value ok';
        UI.cyberStatusVal.textContent = 'ATENÇÃO';
      } else {
        UI.navSpeedStatus.className = 'speed-status-pill safe';
        UI.navSpeedStatus.textContent = 'DENTRO DO LIMITE';
        UI.cockpitSpeedTag.className = 'cockpit-status-tag safe';
        UI.cockpitSpeedTag.textContent = 'VELOCIDADE SEGURA';
        UI.cyberStatusVal.className = 'stat-value ok';
        UI.cyberStatusVal.textContent = 'NORMAL';
      }

      // 3. Tema 1: Arco Circular Digital
      const maxArcSpeed = 160;
      const arcPercent = Math.min(1, speed / maxArcSpeed);
      const totalCircumference = 816; // 2 * PI * 130
      const offset = totalCircumference * (1 - arcPercent);
      UI.digitalArcProgress.style.strokeDashoffset = offset;

      // 4. Tema 2: Ponteiro Analógico (Física de Rotação)
      // -120deg a 0 km/h até +120deg a 240 km/h
      const needleAngle = -120 + (Math.min(240, speed) / 240) * 240;
      UI.analogNeedleGroup.style.transform = `rotate(${needleAngle}deg)`;

      // 5. Tema 4: Cyber Barra de Potência
      const powerPercent = Math.min(100, Math.round((speed / 180) * 100));
      UI.cyberPowerFill.style.width = `${powerPercent}%`;

      // 6. Alerta Sonoro de Excesso de Velocidade
      if (isOverspeed) {
        const now = Date.now();
        if (now - State.lastOverspeedAlertTime > 6000) {
          State.lastOverspeedAlertTime = now;
          AudioEngine.playOverspeedChime();
          AudioEngine.speak(`Atenção: velocidade máxima de ${limit} quilômetros por hora excedida.`);
        }
      }

      // 7. Atualiza Telemetria
      if (speed > State.maxSpeed) {
        State.maxSpeed = speed;
        UI.telemetryMax.textContent = State.maxSpeed;
      }

      State.speedSum += speed;
      State.speedCount++;
      const avg = Math.round(State.speedSum / State.speedCount);
      UI.telemetryAvg.textContent = avg;
    },

    setSpeedLimit(newLimit) {
      State.speedLimit = parseInt(newLimit, 10) || 60;
      UI.signSpeedValue.textContent = State.speedLimit;
      UI.cockpitSignSpeed.textContent = State.speedLimit;
      UI.hudLimitValue.textContent = State.speedLimit;
      UI.cyberLimitVal.textContent = `${State.speedLimit} KM/H`;

      // Reexecuta verificação de velocidade atual com o novo limite
      this.update(State.currentSpeed);
    }
  };

  // ==========================================================================
  // 8. MOTOR DE GEOLOCALIZAÇÃO REAL (GPS DO DISPOSITIVO)
  // ==========================================================================
  const GpsEngine = {
    init() {
      if (!('geolocation' in navigator)) {
        UI.gpsStatusText.textContent = 'GPS não suportado neste aparelho';
        return;
      }

      UI.gpsStatusText.textContent = 'Buscando satélites...';

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };

      State.watchId = navigator.geolocation.watchPosition(
        pos => this.onPositionSuccess(pos),
        err => this.onPositionError(err),
        options
      );
    },

    onPositionSuccess(pos) {
      State.position.hasRealGps = true;
      UI.gpsStatusText.textContent = `GPS Ativo (precisão: ±${Math.round(pos.coords.accuracy)}m)`;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const heading = pos.coords.heading || 0;

      // Velocidade do GPS vem em metros por segundo (m/s). Multiplicamos por 3.6 para km/h!
      let gpsSpeedKmH = 0;
      if (pos.coords.speed !== null && !isNaN(pos.coords.speed)) {
        gpsSpeedKmH = Math.max(0, pos.coords.speed * 3.6);
      }

      State.position.lat = lat;
      State.position.lng = lng;
      State.position.heading = heading;

      // Se não estiver em modo de teste/simulador no PC, atualiza com a velocidade real
      if (!State.isSimulatorActive) {
        State.currentSpeed = gpsSpeedKmH;
        SpeedometerEngine.update(gpsSpeedKmH);
        MapEngine.updateCarPosition(lat, lng, heading);
        ProximityEngine.checkProximity();
      }
    },

    onPositionError(err) {
      console.warn('Geolocalização aviso:', err.message);
      UI.gpsStatusText.textContent = 'GPS offline · Simulador disponível';
    }
  };

  // ==========================================================================
  // 9. MOTOR DE BUSCA DE DESTINOS, ROTAS & NAVEGAÇÃO ATIVA
  // ==========================================================================
  const NavigationEngine = {
    searchTimeout: null,

    init() {
      // 1. Digitação na barra de busca
      UI.inputDestination.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        UI.btnClearSearch.hidden = val.length === 0;
        clearTimeout(this.searchTimeout);
        if (val.length >= 3) {
          this.searchTimeout = setTimeout(() => this.searchPlaces(val), 400);
        } else {
          UI.searchResultsDropdown.hidden = true;
        }
      });

      UI.btnClearSearch.addEventListener('click', () => {
        UI.inputDestination.value = '';
        UI.btnClearSearch.hidden = true;
        UI.searchResultsDropdown.hidden = true;
        UI.inputDestination.focus();
      });

      UI.btnSearchGo.addEventListener('click', () => {
        const val = UI.inputDestination.value.trim();
        if (val) this.searchPlaces(val);
      });

      UI.inputDestination.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = UI.inputDestination.value.trim();
          if (val) this.searchPlaces(val);
        }
      });

      // 2. Atalhos Rápidos (Chips)
      UI.quickChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const query = chip.getAttribute('data-query');
          UI.inputDestination.value = query;
          UI.btnClearSearch.hidden = false;
          this.searchPlaces(query);
        });
      });

      // 3. Botão Cancelar / Fechar Prévia da Rota
      UI.btnClosePreview.addEventListener('click', () => {
        this.clearRoute();
      });

      // 4. Botão INICIAR NAVEGAÇÃO
      UI.btnStartNavigation.addEventListener('click', () => {
        this.startNavigation();
      });

      // 5. Botão Encerrar Navegação
      UI.btnStopNav.addEventListener('click', () => {
        this.stopNavigation();
      });

      // 6. Re-adquire Screen Wake Lock se o usuário minimizou o app e voltou
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && State.isNavigating) {
          this.requestWakeLock();
        }
      });

      // 7. Fecha dropdown de busca se clicar fora
      document.addEventListener('click', (e) => {
        if (UI.searchDestWrapper && !UI.searchDestWrapper.contains(e.target)) {
          UI.searchResultsDropdown.hidden = true;
        }
      });
    },

    async searchPlaces(query) {
      UI.resultsListContainer.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 0.8rem; text-align: center;">Buscando endereços no Brasil...</div>';
      UI.searchResultsDropdown.hidden = false;

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=6&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
        const data = await res.json();

        if (data && data.length > 0) {
          this.renderSearchResults(data);
        } else {
          this.renderMockResults(query);
        }
      } catch (err) {
        console.warn('Busca remota falhou, usando catálogo inteligente:', err);
        this.renderMockResults(query);
      }
    },

    renderSearchResults(results) {
      UI.resultsListContainer.innerHTML = '';
      results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
          <div class="result-icon">📍</div>
          <div class="result-texts">
            <div class="result-main">${item.name || item.display_name.split(',')[0]}</div>
            <div class="result-sub">${item.display_name}</div>
          </div>
        `;
        div.addEventListener('click', () => {
          UI.searchResultsDropdown.hidden = true;
          UI.inputDestination.value = item.name || item.display_name.split(',')[0];
          this.selectDestination({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            name: item.name || item.display_name.split(',')[0],
            address: item.display_name
          });
        });
        UI.resultsListContainer.appendChild(div);
      });
    },

    renderMockResults(query) {
      // Catálogo de fallback instantâneo no Brasil para respostas ultra-rápidas
      const mockPlaces = [
        { name: `${query}`, address: `${query} - São Paulo, SP`, lat: State.position.lat + 0.035, lng: State.position.lng + 0.025 },
        { name: `Av. Paulista, 1578 (MASP)`, address: `Bela Vista, São Paulo - SP`, lat: -23.561414, lng: -46.655881 },
        { name: `Aeroporto de Congonhas`, address: `Vila Congonhas, São Paulo - SP`, lat: -23.6273, lng: -46.6565 },
        { name: `Shopping Ibirapuera`, address: `Av. Ibirapuera, 3103 - Moema, São Paulo`, lat: -23.6105, lng: -46.6668 },
        { name: `Parque Ibirapuera - Portão 3`, address: `Av. Pedro Álvares Cabral - Moema, São Paulo`, lat: -23.5874, lng: -46.6576 }
      ];
      this.renderSearchResults(mockPlaces.map(p => ({
        name: p.name,
        display_name: p.address,
        lat: p.lat,
        lon: p.lng
      })));
    },

    async selectDestination(dest) {
      State.destination = dest;
      UI.previewDestTitle.textContent = dest.name;
      UI.previewDestSub.textContent = dest.address;

      await this.calculateRoute(State.position, dest);
    },

    async calculateRoute(start, end) {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;

      try {
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          this.applyRouteData(route, end);
        } else {
          this.generateSmartFallbackRoute(start, end);
        }
      } catch (err) {
        console.warn('Cálculo OSRM offline, gerando rota urbana direta:', err);
        this.generateSmartFallbackRoute(start, end);
      }
    },

    applyRouteData(route, end) {
      const coords = route.geometry.coordinates.map(pt => [pt[1], pt[0]]); // [lat, lng]
      State.routePoints = coords;
      State.routeSimIndex = 0;

      const distKm = (route.distance / 1000).toFixed(1);
      const durationMin = Math.max(1, Math.round(route.duration / 60));

      const now = new Date();
      now.setMinutes(now.getMinutes() + durationMin);
      const etaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      UI.routeDistEst.textContent = `${distKm} km`;
      UI.routeTimeEst.textContent = `${durationMin} min`;
      UI.routeEtaEst.textContent = etaStr;

      // Extrai passos de manobra
      State.routeSteps = [];
      if (route.legs && route.legs[0] && route.legs[0].steps) {
        State.routeSteps = route.legs[0].steps.map(s => {
          let icon = '⬆';
          const mod = s.maneuver.modifier;
          if (mod && mod.includes('right')) icon = '➔';
          else if (mod && mod.includes('left')) icon = '⬅';
          else if (s.maneuver.type === 'roundabout') icon = '🔄';

          return {
            instruction: s.name ? `Na ${s.name}` : 'Siga em frente na rota',
            distance: Math.round(s.distance),
            icon: icon
          };
        });
      }

      MapEngine.drawRoute(coords, end);
      UI.routePreviewCard.hidden = false;
      AudioEngine.playBeep(700, 0.1);
    },

    generateSmartFallbackRoute(start, end) {
      // 14 pontos interpolados formando um corredor urbano realista
      const points = [];
      const numPts = 14;
      for (let i = 0; i <= numPts; i++) {
        const factor = i / numPts;
        const lat = start.lat + (end.lat - start.lat) * factor + Math.sin(factor * Math.PI) * 0.005;
        const lng = start.lng + (end.lng - start.lng) * factor - Math.sin(factor * Math.PI) * 0.004;
        points.push([lat, lng]);
      }
      State.routePoints = points;
      State.routeSimIndex = 0;

      const distMeters = ProximityEngine.calculateDistanceMeters(start.lat, start.lng, end.lat, end.lng) * 1.35;
      const distKm = (distMeters / 1000).toFixed(1);
      const durationMin = Math.max(3, Math.round(distKm / 0.5));

      const now = new Date();
      now.setMinutes(now.getMinutes() + durationMin);
      const etaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      UI.routeDistEst.textContent = `${distKm} km`;
      UI.routeTimeEst.textContent = `${durationMin} min`;
      UI.routeEtaEst.textContent = etaStr;

      State.routeSteps = [
        { instruction: 'Siga em frente pela via atual', distance: 350, icon: '⬆' },
        { instruction: 'Vire à direita na próxima avenida', distance: 850, icon: '➔' },
        { instruction: 'Mantenha-se à esquerda no corredor', distance: 1600, icon: '⬅' },
        { instruction: 'Você chegará ao destino à direita', distance: 200, icon: '🏁' }
      ];

      MapEngine.drawRoute(points, end);
      UI.routePreviewCard.hidden = false;
    },

    startNavigation() {
      AudioEngine.init();
      State.isNavigating = true;
      State.currentStepIndex = 0;
      State.routeSimIndex = 0;

      UI.routePreviewCard.hidden = true;
      UI.searchDestWrapper.hidden = true;
      UI.activeManeuverBanner.hidden = false;

      // Trava tela ligada para não apagar enquanto dirige (Screen Wake Lock)
      this.requestWakeLock();

      const firstStep = State.routeSteps[0] || { instruction: 'Siga pela rota traçada', distance: 300, icon: '⬆' };
      UI.maneuverIcon.textContent = firstStep.icon;
      UI.maneuverDist.textContent = `Em ${firstStep.distance} metros`;
      UI.maneuverStreet.textContent = firstStep.instruction;

      AudioEngine.playIncidentChime();
      const destName = State.destination ? State.destination.name : 'Destino';
      AudioEngine.speak(`Iniciando navegação para ${destName}. ${firstStep.instruction}`);

      MapEngine.leafletMap.setView([State.position.lat, State.position.lng], 17, { animate: true });
    },

    stopNavigation() {
      State.isNavigating = false;
      UI.activeManeuverBanner.hidden = true;
      UI.searchDestWrapper.hidden = false;
      this.clearRoute();
      this.releaseWakeLock();
      AudioEngine.speak('Navegação encerrada.');
    },

    clearRoute() {
      UI.routePreviewCard.hidden = true;
      State.destination = null;
      State.routePoints = [];
      State.routeSteps = [];
      MapEngine.clearRouteLayers();
    },

    async requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          State.wakeLock = await navigator.wakeLock.request('screen');
          console.log('📱 Screen Wake Lock ativado: a tela não desligará durante a condução!');
        } catch (e) {
          console.warn('Wake Lock info:', e);
        }
      }
    },

    releaseWakeLock() {
      if (State.wakeLock) {
        State.wakeLock.release().then(() => {
          State.wakeLock = null;
        });
      }
    }
  };

  // ==========================================================================
  // 10. SIMULADOR DE DIREÇÃO (PARA TESTES IMEDIATOS NO COMPUTADOR)
  // ==========================================================================
  const SimulatorEngine = {
    init() {
      // Slider de Velocidade
      UI.simSpeedSlider.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        this.setSpeed(val);
      });

      // Botões Rápidos
      UI.btnSimAcc10.addEventListener('click', () => {
        this.setSpeed(State.currentSpeed + 10);
      });

      UI.btnSimAcc50.addEventListener('click', () => {
        this.setSpeed(50);
      });

      UI.btnSimAcc80.addEventListener('click', () => {
        this.setSpeed(80);
      });

      UI.btnSimAcc120.addEventListener('click', () => {
        this.setSpeed(120);
      });

      UI.btnSimBrake.addEventListener('click', () => {
        this.setSpeed(0);
      });

      // Disparador de Ocorrência Próxima para Testar Alerta Sonoro
      UI.btnSimTriggerIncident.addEventListener('click', () => {
        // Cria um radar a 350 metros da posição atual simulada
        const testIncident = {
          id: 'test-sim-' + Date.now(),
          type: 'radar',
          title: 'Radar de Teste (60 km/h)',
          icon: '📸',
          lat: State.position.lat + 0.0025,
          lng: State.position.lng + 0.0025,
          road: UI.currentRoadName.textContent || 'Via Expressa',
          lane: 'Todas',
          timeText: 'Agora',
          timestamp: Date.now(),
          votesUp: 5,
          votesDown: 0,
          soundText: 'Atenção: Radar de velocidade à frente'
        };

        CloudEngine.addIncident(testIncident);
        AudioEngine.speak('Alerta de radar inserido para teste!');
      });

      // Loop de Deslocamento do Carro ao Acelerar
      setInterval(() => {
        if (State.currentSpeed > 0) {
          this.advanceVehicleAlongRoute();
        }
      }, 1000);
    },

    setSpeed(speedVal) {
      AudioEngine.init();
      State.isSimulatorActive = true;
      State.currentSpeed = Math.min(180, Math.max(0, speedVal));
      UI.simSpeedSlider.value = State.currentSpeed;
      UI.simSpeedDisplay.textContent = `${State.currentSpeed} km/h`;

      SpeedometerEngine.update(State.currentSpeed);
      ProximityEngine.checkProximity();
    },

    advanceVehicleAlongRoute() {
      // 1. Se estiver navegando para um destino ativo, segue a rota real calculada!
      if (State.isNavigating && State.routePoints.length > 1) {
        if (State.routeSimIndex === undefined) State.routeSimIndex = 0;
        State.routeSimIndex = Math.min(State.routePoints.length - 1, State.routeSimIndex + 1);
        const pt = State.routePoints[State.routeSimIndex];
        const prevPt = State.routePoints[Math.max(0, State.routeSimIndex - 1)];

        // Calcula orientação da seta do carro
        const dLng = pt[1] - prevPt[1];
        const dLat = pt[0] - prevPt[0];
        const heading = (Math.atan2(dLng, dLat) * (180 / Math.PI) + 360) % 360;

        State.position.lat = pt[0];
        State.position.lng = pt[1];
        State.position.heading = heading;

        // Distância restante
        const distRemainingMeters = ProximityEngine.calculateDistanceMeters(
          State.position.lat, State.position.lng,
          State.destination.lat, State.destination.lng
        );
        const distRemainingKm = (distRemainingMeters / 1000).toFixed(1);

        if (distRemainingMeters <= 50) {
          AudioEngine.playIncidentChime();
          AudioEngine.speak('Você chegou ao seu destino!');
          UI.maneuverDist.textContent = 'Destino Atingido!';
          UI.maneuverStreet.textContent = State.destination.name;
          UI.maneuverIcon.textContent = '🏁';
          State.isNavigating = false;
        } else {
          UI.maneuverDist.textContent = `A ${distRemainingMeters > 1000 ? distRemainingKm + ' km' : Math.round(distRemainingMeters) + 'm'}`;
        }

        // Atualiza odômetro
        const kmAdded = (State.currentSpeed / 3600);
        State.distanceTraveledKm += kmAdded;
        UI.telemetryDistance.textContent = State.distanceTraveledKm.toFixed(1);

        MapEngine.updateCarPosition(State.position.lat, State.position.lng, heading);
        ProximityEngine.checkProximity();
        return;
      }

      // 2. Rota simulada padrão caso não haja destino ativo
      const step = 0.0004 * (State.currentSpeed / 60);
      State.simulatedRoadIndex = (State.simulatedRoadIndex + 1) % SIMULATED_ROUTE.length;
      const targetPoint = SIMULATED_ROUTE[State.simulatedRoadIndex];

      State.position.lat += (targetPoint.lat - State.position.lat) * 0.25;
      State.position.lng += (targetPoint.lng - State.position.lng) * 0.25;

      // Atualiza nome da via
      UI.currentRoadName.textContent = targetPoint.road;
      if (State.autoDetectLimit && targetPoint.limit) {
        SpeedometerEngine.setSpeedLimit(targetPoint.limit);
      }

      // Atualiza hodômetro
      const kmAdded = (State.currentSpeed / 3600);
      State.distanceTraveledKm += kmAdded;
      UI.telemetryDistance.textContent = State.distanceTraveledKm.toFixed(1);

      MapEngine.updateCarPosition(State.position.lat, State.position.lng, 45);
      ProximityEngine.checkProximity();
    }
  };

  // ==========================================================================
  // 10. CONTROLADORES DE EVENTOS E MODAIS DA INTERFACE
  // ==========================================================================
  function setupEventListeners() {
    // 1. Troca de Modo (Navegação vs. Cockpit)
    UI.tabNav.addEventListener('click', () => {
      State.mode = 'nav';
      UI.tabNav.classList.add('active');
      UI.tabCockpit.classList.remove('active');
      UI.viewNav.classList.add('active');
      UI.viewCockpit.classList.remove('active');
      setTimeout(() => {
        if (MapEngine.leafletMap) MapEngine.leafletMap.invalidateSize();
      }, 100);
    });

    UI.tabCockpit.addEventListener('click', () => {
      State.mode = 'cockpit';
      UI.tabCockpit.classList.add('active');
      UI.tabNav.classList.remove('active');
      UI.viewCockpit.classList.add('active');
      UI.viewNav.classList.remove('active');
    });

    // 2. Seletor de Temas do Cockpit
    UI.themePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const theme = pill.getAttribute('data-theme');
        State.cockpitTheme = theme;

        UI.themePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        UI.gaugeDisplays.forEach(d => d.classList.remove('active'));
        if (theme === 'digital') UI.displayDigital.classList.add('active');
        if (theme === 'analog') UI.displayAnalog.classList.add('active');
        if (theme === 'hud') UI.displayHud.classList.add('active');
        if (theme === 'cyber') UI.displayCyber.classList.add('active');
      });
    });

    // 3. Alternar Espelhamento do HUD Noturno
    UI.btnToggleMirror.addEventListener('click', () => {
      State.hudMirrored = !State.hudMirrored;
      const badge = document.getElementById('hudMirrorBadge');
      const instruction = document.getElementById('hudInstructionText');

      if (State.hudMirrored) {
        UI.hudMirrorBox.classList.add('mirrored');
        if (badge) badge.textContent = 'ESPELHO ATIVO (PARA-BRISA)';
        UI.btnToggleMirror.textContent = '🔄 Voltar para Modo Direto';
        if (instruction) instruction.textContent = '🌙 Deite o celular virado para cima no painel do carro à noite. A velocidade refletirá perfeitamente legível no vidro do para-brisa!';
      } else {
        UI.hudMirrorBox.classList.remove('mirrored');
        if (badge) badge.textContent = 'MODO DIRETO (TELA)';
        UI.btnToggleMirror.textContent = '🪞 Espelhar para Para-brisa do Carro';
        if (instruction) instruction.textContent = '💡 Modo direto para celular no suporte. Clique no botão acima caso queira deitar o celular no painel à noite e refletir os números no vidro do para-brisa!';
      }
    });

    // 4. Controle de Áudio
    UI.btnAudioToggle.addEventListener('click', () => {
      AudioEngine.init();
      if (State.audioMode === 'voice') {
        State.audioMode = 'beep';
        UI.audioIcon.textContent = '🔔';
        UI.audioLabel.textContent = 'Som Bipe';
        AudioEngine.playBeep(880, 0.15);
      } else if (State.audioMode === 'beep') {
        State.audioMode = 'mute';
        UI.audioIcon.textContent = '🔇';
        UI.audioLabel.textContent = 'Mudo';
      } else {
        State.audioMode = 'voice';
        UI.audioIcon.textContent = '🔊';
        UI.audioLabel.textContent = 'Voz & Som';
        AudioEngine.speak('Alertas por voz ativados.');
      }
    });

    // 5. Centralizar no Veículo
    UI.btnRecenter.addEventListener('click', () => {
      MapEngine.recenter();
    });

    // 6. Fechar Alerta de Proximidade
    UI.btnDismissProx.addEventListener('click', () => {
      UI.proximityBanner.setAttribute('hidden', '');
    });

    // 7. Modal de Reportar Ocorrência
    UI.btnOpenReportModal.addEventListener('click', () => {
      AudioEngine.init();
      UI.modalReport.removeAttribute('hidden');
    });

    UI.btnCloseReportModal.addEventListener('click', () => {
      UI.modalReport.setAttribute('hidden', '');
    });

    UI.btnCancelReport.addEventListener('click', () => {
      UI.modalReport.setAttribute('hidden', '');
    });

    UI.incidentButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.incidentButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        State.selectedIncidentType = btn.getAttribute('data-type');
      });
    });

    UI.laneTags.forEach(tag => {
      tag.addEventListener('click', () => {
        UI.laneTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        State.selectedIncidentLane = tag.getAttribute('data-lane');
      });
    });

    UI.btnSubmitReport.addEventListener('click', () => {
      const activeBtn = document.querySelector('.incident-btn.selected') || UI.incidentButtons[0];
      const type = activeBtn.getAttribute('data-type');
      const title = activeBtn.getAttribute('data-title');
      const icon = activeBtn.getAttribute('data-icon');
      const soundPhrase = activeBtn.getAttribute('data-sound');

      const newInc = {
        id: 'inc-' + Date.now(),
        type: type,
        title: title,
        icon: icon,
        lat: State.position.lat,
        lng: State.position.lng,
        road: UI.currentRoadName.textContent || 'Via Atual',
        lane: State.selectedIncidentLane,
        timeText: 'Agora',
        timestamp: Date.now(),
        votesUp: 1,
        votesDown: 0,
        soundText: soundPhrase
      };

      CloudEngine.addIncident(newInc);
      UI.modalReport.setAttribute('hidden', '');

      AudioEngine.playBeep(1000, 0.2);
      AudioEngine.speak('Alerta publicado com sucesso!');
    });

    // 8. Modal de Limite de Velocidade
    UI.speedLimitSign.addEventListener('click', () => {
      UI.modalSpeedLimit.removeAttribute('hidden');
    });

    UI.btnCloseSpeedModal.addEventListener('click', () => {
      UI.modalSpeedLimit.setAttribute('hidden', '');
    });

    UI.btnConfirmSpeedLimit.addEventListener('click', () => {
      UI.modalSpeedLimit.setAttribute('hidden', '');
    });

    UI.signPickButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.signPickButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = btn.getAttribute('data-speed');
        SpeedometerEngine.setSpeedLimit(speed);
      });
    });

    UI.chkAutoDetectLimit.addEventListener('change', e => {
      State.autoDetectLimit = e.target.checked;
    });

    // 9. Modal de Conexão à Nuvem
    UI.btnCloudModal.addEventListener('click', () => {
      UI.modalCloud.removeAttribute('hidden');
    });

    UI.btnCloseCloudModal.addEventListener('click', () => {
      UI.modalCloud.setAttribute('hidden', '');
    });

    UI.btnConfirmCloudModal.addEventListener('click', () => {
      UI.modalCloud.setAttribute('hidden', '');
    });

    UI.btnConnectFirebase.addEventListener('click', () => {
      const raw = UI.firebaseConfigInput.value.trim();
      if (!raw) {
        alert('Por favor, cole o objeto JSON de configuração do seu projeto Firebase.');
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        CloudEngine.connectFirebase(parsed, true);
        UI.modalCloud.setAttribute('hidden', '');
      } catch (err) {
        alert('O texto colado não é um JSON válido. Verifique as chaves e aspas.');
      }
    });

    UI.btnResetFirebase.addEventListener('click', () => {
      localStorage.removeItem('velox_firebase_config');
      CloudEngine.initLocalMode();
      alert('Modo Simulado restaurado com sucesso.');
      UI.modalCloud.setAttribute('hidden', '');
    });

    // 10. Toggle do Simulador
    UI.btnToggleSim.addEventListener('click', () => {
      UI.simulatorBar.classList.toggle('hidden');
    });

    UI.btnCloseSim.addEventListener('click', () => {
      UI.simulatorBar.classList.add('hidden');
    });

    // 11. Modal de Instalação no Celular
    const btnInstallApp = document.getElementById('btnInstallApp');
    const modalInstall = document.getElementById('modalInstall');
    const btnCloseInstallModal = document.getElementById('btnCloseInstallModal');
    const btnConfirmInstallModal = document.getElementById('btnConfirmInstallModal');

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnInstallApp) {
        btnInstallApp.classList.add('pulse-glow');
      }
    });

    if (btnInstallApp && modalInstall) {
      btnInstallApp.addEventListener('click', () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choice) => {
            if (choice.outcome === 'accepted') {
              console.log('Usuário aceitou a instalação do Velox GPS!');
            }
            deferredPrompt = null;
          });
        } else {
          modalInstall.removeAttribute('hidden');
        }
      });
    }

    if (btnCloseInstallModal && modalInstall) {
      btnCloseInstallModal.addEventListener('click', () => {
        modalInstall.setAttribute('hidden', '');
      });
    }

    if (btnConfirmInstallModal && modalInstall) {
      btnConfirmInstallModal.addEventListener('click', () => {
        modalInstall.setAttribute('hidden', '');
      });
    }
  }

  // ==========================================================================
  // 11. INICIALIZAÇÃO DA APLICAÇÃO
  // ==========================================================================
  function initApp() {
    console.log('🚀 Inicializando Velox GPS...');
    MapEngine.init();
    SpeedometerEngine.init();
    CloudEngine.init();
    GpsEngine.init();
    NavigationEngine.init();
    SimulatorEngine.init();
    setupEventListeners();

    // Ativa contexto de áudio no primeiro toque do usuário na tela (obrigatório para navegadores mobile)
    window.addEventListener('pointerdown', () => AudioEngine.init(), { once: true });

    // Registra Service Worker para suporte PWA (Instalação no celular)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('📱 Service Worker registrado: Velox GPS pronto para instalação mobile!'))
        .catch(err => console.log('Service Worker status:', err));
    }

    // Define valores iniciais na interface
    UI.currentRoadName.textContent = 'Av. Paulista (Bela Vista, São Paulo)';
    SpeedometerEngine.setSpeedLimit(60);
    SpeedometerEngine.update(0);
  }

  // Inicia ao carregar a página
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
