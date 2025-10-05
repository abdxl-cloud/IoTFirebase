import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter, ZAxis } from 'recharts';
import { MapPin, Thermometer, Heart, Activity, AlertCircle, Navigation, Sun, Moon, TrendingUp, FileText, Map } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyBGXpnboh9puFITIFIVJBcSwLhGPIQKjuo",
  authDomain: "livestock-monitor-29d65.firebaseapp.com",
  databaseURL: "https://livestock-monitor-29d65-default-rtdb.firebaseio.com",
  projectId: "livestock-monitor-29d65",
  storageBucket: "livestock-monitor-29d65.firebasestorage.app",
  messagingSenderId: "378991266413",
  appId: "1:378991266413:web:2efafb4008afb014a2cd64",
  measurementId: "G-Q603SRCEN6"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const themes = {
  dark: {
    bg: '#0F172A',
    cardBg: '#1E293B',
    border: '#334155',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    alertBg: '#7F1D1D',
    alertBorder: '#DC2626',
    chartGrid: '#334155'
  },
  light: {
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    textSecondary: '#64748B',
    alertBg: '#FEE2E2',
    alertBorder: '#DC2626',
    chartGrid: '#E2E8F0'
  }
};

export default function LivestockMonitor() {
  const [latestReading, setLatestReading] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [geofenceSettings, setGeofenceSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportPeriod, setReportPeriod] = useState('daily');

  const theme = isDark ? themes.dark : themes.light;

  useEffect(() => {
    const readingsRef = ref(database, 'LVM-READINGS');
    const settingsRef = ref(database, 'LVM-SETTINGS');

    onValue(settingsRef, (snapshot) => {
      setGeofenceSettings(snapshot.val());
    });

    onValue(readingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const readings = Object.entries(data)
          .filter(([key]) => key.includes(':'))
          .map(([timestamp, values]) => ({
            timestamp,
            ...values
          }))
          .sort((a, b) => {
            const parseTime = (ts) => {
              const parts = ts.split(':');
              if (parts.length === 6) {
                const [day, month, year, hour, min, sec] = parts;
                return new Date(year, month - 1, day, hour, min, sec).getTime();
              }
              return 0;
            };
            return parseTime(b.timestamp) - parseTime(a.timestamp);
          });

        setLatestReading(readings[0] || null);
        setHistoricalData(readings);
        setLoading(false);
      }
    });
  }, []);

  const getStatusColor = (status) => {
    if (!status) return '#64748B';
    return status === 'INSIDE' ? '#10B981' : '#EF4444';
  };

  const getVitalColor = (value, min, max) => {
    if (!value || value <= 0) return '#94A3B8';
    return value >= min && value <= max ? '#10B981' : '#EF4444';
  };

  const calculateHealthReport = (period) => {
    const now = new Date();
    const filtered = historicalData.filter(r => {
      const parts = r.timestamp.split(':');
      if (parts.length === 6) {
        const [day, month, year] = parts;
        const readingDate = new Date(year, month - 1, day);
        const daysDiff = Math.floor((now - readingDate) / (1000 * 60 * 60 * 24));
        return period === 'daily' ? daysDiff === 0 : daysDiff <= 7;
      }
      return false;
    });

    const temps = filtered.filter(r => r['LVBOT-TEMPERATURE_C']).map(r => parseFloat(r['LVBOT-TEMPERATURE_C']));
    const hrs = filtered.filter(r => r['LVBOT-HEART_RATE'] && parseInt(r['LVBOT-HEART_RATE']) > 0).map(r => parseInt(r['LVBOT-HEART_RATE']));
    const geofenceViolations = filtered.filter(r => r['LVBOT-GEOFENCE_STATUS'] === 'OUTSIDE').length;

    return {
      totalReadings: filtered.length,
      avgTemp: temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 'N/A',
      minTemp: temps.length > 0 ? Math.min(...temps).toFixed(1) : 'N/A',
      maxTemp: temps.length > 0 ? Math.max(...temps).toFixed(1) : 'N/A',
      avgHR: hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 'N/A',
      minHR: hrs.length > 0 ? Math.min(...hrs) : 'N/A',
      maxHR: hrs.length > 0 ? Math.max(...hrs) : 'N/A',
      geofenceViolations,
      healthScore: calculateHealthScore(temps, hrs, geofenceViolations)
    };
  };

  const calculateHealthScore = (temps, hrs, violations) => {
    let score = 100;
    const abnormalTemps = temps.filter(t => t < 36 || t > 39).length;
    const abnormalHRs = hrs.filter(h => h < 60 || h > 80).length;
    
    score -= (abnormalTemps / temps.length) * 30;
    score -= (abnormalHRs / hrs.length) * 30;
    score -= Math.min(violations * 5, 40);
    
    return Math.max(0, Math.round(score));
  };

  const getMovementData = () => {
    return historicalData
      .filter(r => r['LVBOT-LAT'] && r['LVBOT-LNG'])
      .map(r => ({
        lat: parseFloat(r['LVBOT-LAT']),
        lng: parseFloat(r['LVBOT-LNG']),
        timestamp: r.timestamp
      }))
      .slice(0, 200);
  };

  const getHourlyActivity = () => {
    const hourCounts = Array(24).fill(0);
    historicalData.forEach(r => {
      const parts = r.timestamp.split(':');
      if (parts.length === 6) {
        const hour = parseInt(parts[3]);
        if (!isNaN(hour)) hourCounts[hour]++;
      }
    });
    return hourCounts.map((count, hour) => ({ hour, count }));
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: theme.bg,
      color: theme.text,
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      transition: 'background-color 0.3s ease, color 0.3s ease'
    },
    header: {
      marginBottom: '32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px'
    },
    headerContent: {
      flex: '1'
    },
    title: {
      fontSize: '2.5rem',
      fontWeight: '700',
      marginBottom: '8px',
      background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text'
    },
    subtitle: {
      color: theme.textSecondary,
      fontSize: '1rem'
    },
    themeToggle: {
      backgroundColor: theme.cardBg,
      border: `2px solid ${theme.border}`,
      borderRadius: '50px',
      padding: '10px 20px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      transition: 'all 0.3s ease',
      boxShadow: isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
    },
    tabs: {
      display: 'flex',
      gap: '8px',
      marginBottom: '24px',
      borderBottom: `2px solid ${theme.border}`,
      paddingBottom: '0'
    },
    tab: {
      padding: '12px 24px',
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      color: theme.textSecondary,
      fontSize: '1rem',
      fontWeight: '600',
      borderBottom: '3px solid transparent',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    activeTab: {
      color: '#3B82F6',
      borderBottomColor: '#3B82F6'
    },
    alert: {
      backgroundColor: theme.alertBg,
      border: `2px solid ${theme.alertBorder}`,
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      animation: 'pulse 2s infinite',
      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '20px',
      marginBottom: '24px'
    },
    card: {
      backgroundColor: theme.cardBg,
      borderRadius: '16px',
      padding: '24px',
      border: `1px solid ${theme.border}`,
      transition: 'all 0.3s ease',
      boxShadow: isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'
    },
    cardHover: {
      transform: 'translateY(-4px)',
      boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.12)'
    },
    cardTitle: {
      fontSize: '1rem',
      fontWeight: '600',
      color: theme.textSecondary
    },
    bigValue: {
      fontSize: '2.75rem',
      fontWeight: '700',
      lineHeight: '1',
      marginBottom: '8px'
    },
    smallText: {
      fontSize: '0.875rem',
      color: theme.textSecondary
    },
    reportCard: {
      backgroundColor: theme.cardBg,
      borderRadius: '16px',
      padding: '32px',
      border: `1px solid ${theme.border}`,
      boxShadow: isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'
    },
    healthScore: {
      fontSize: '4rem',
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: '16px'
    },
    statGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '24px',
      marginTop: '24px'
    },
    statBox: {
      padding: '16px',
      borderRadius: '12px',
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      border: `1px solid ${theme.border}`
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Activity size={64} style={{ animation: 'pulse 2s infinite', margin: '0 auto' }} />
          <p style={{ fontSize: '1.25rem', marginTop: '20px' }}>Loading livestock data...</p>
        </div>
      </div>
    );
  }

  const temp = parseFloat(latestReading?.['LVBOT-TEMPERATURE_C']) || 0;
  const hr = parseInt(latestReading?.['LVBOT-HEART_RATE']) || 0;
  const spo2 = parseInt(latestReading?.['LVBOT-SP02']) || 0;
  const geofenceStatus = latestReading?.['LVBOT-GEOFENCE_STATUS'];
  const geofenceDist = parseFloat(latestReading?.['LVBOT-GEOFENCE_DISATNCE']) || 0;

  const tempData = historicalData.slice(0, 50).reverse()
    .filter(r => r['LVBOT-TEMPERATURE_C'])
    .map((r, i) => ({ index: i, temp: parseFloat(r['LVBOT-TEMPERATURE_C']) }));

  const hrData = historicalData.slice(0, 50).reverse()
    .filter(r => r['LVBOT-HEART_RATE'] && parseInt(r['LVBOT-HEART_RATE']) > 0)
    .map((r, i) => ({ index: i, hr: parseInt(r['LVBOT-HEART_RATE']) }));

  const movementData = getMovementData();
  const hourlyActivity = getHourlyActivity();
  const healthReport = calculateHealthReport(reportPeriod);

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <header style={styles.header}>
          <div style={styles.headerContent}>
            <h1 style={styles.title}>Livestock Monitor</h1>
            <p style={styles.subtitle}>Real-time animal health & location tracking</p>
          </div>
          <button 
            onClick={() => setIsDark(!isDark)}
            style={styles.themeToggle}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            <span style={{ fontWeight: '600' }}>{isDark ? 'Light' : 'Dark'} Mode</span>
          </button>
        </header>

        <div style={styles.tabs}>
          <button 
            style={{ ...styles.tab, ...(activeTab === 'dashboard' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('dashboard')}
          >
            <TrendingUp size={18} />
            Dashboard
          </button>
          <button 
            style={{ ...styles.tab, ...(activeTab === 'movement' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('movement')}
          >
            <Map size={18} />
            Movement Patterns
          </button>
          <button 
            style={{ ...styles.tab, ...(activeTab === 'reports' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('reports')}
          >
            <FileText size={18} />
            Health Reports
          </button>
        </div>

        {geofenceStatus === 'OUTSIDE' && (
          <div style={styles.alert}>
            <AlertCircle size={32} color="#DC2626" />
            <div>
              <h3 style={{ fontWeight: '700', fontSize: '1.2rem', marginBottom: '4px', color: '#DC2626' }}>Geofence Alert!</h3>
              <p style={{ color: '#DC2626' }}>Animal is {geofenceDist.toFixed(1)}m outside the safe zone</p>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
            <div style={styles.grid}>
              <div style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Thermometer size={24} color="#F97316" />
                  <h3 style={styles.cardTitle}>Temperature</h3>
                </div>
                <p style={{ ...styles.bigValue, color: getVitalColor(temp, 36, 39) }}>
                  {temp > 0 ? temp.toFixed(1) : '--'}°C
                </p>
                <p style={styles.smallText}>Normal range: 36-39°C</p>
              </div>

              <div style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Heart size={24} color="#EF4444" />
                  <h3 style={styles.cardTitle}>Heart Rate</h3>
                </div>
                <p style={{ ...styles.bigValue, color: getVitalColor(hr, 60, 80) }}>
                  {hr > 0 ? hr : '--'} <span style={{ fontSize: '1.5rem' }}>bpm</span>
                </p>
                <p style={styles.smallText}>
                  {latestReading?.['LVBOT-VALID_HR'] === '1' ? 'Valid reading' : 'No valid reading'}
                </p>
              </div>

              <div style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Activity size={24} color="#3B82F6" />
                  <h3 style={styles.cardTitle}>Blood Oxygen</h3>
                </div>
                <p style={{ ...styles.bigValue, color: getVitalColor(spo2, 95, 100) }}>
                  {spo2 > 0 ? spo2 : '--'}%
                </p>
                <p style={styles.smallText}>
                  {latestReading?.['LVBOT-VALID_SP02'] === '1' ? 'Valid reading' : 'No valid reading'}
                </p>
              </div>

              <div style={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <MapPin size={24} color="#10B981" />
                  <h3 style={styles.cardTitle}>Location Status</h3>
                </div>
                <div style={{ 
                  display: 'inline-block',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: 'white',
                  backgroundColor: getStatusColor(geofenceStatus)
                }}>
                  {geofenceStatus || 'Unknown'}
                </div>
                <p style={styles.smallText}>GPS Satellites: {latestReading?.['LVBOT-GPS_SATELLITE'] || 'N/A'}</p>
                {latestReading?.['LVBOT-LOCATION_LINK'] && (
                  <a 
                    href={latestReading['LVBOT-LOCATION_LINK']} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{
                      color: '#3B82F6',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '12px',
                      fontWeight: '500'
                    }}
                  >
                    <Navigation size={16} />
                    View on Google Maps
                  </a>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
              <div style={styles.card}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px' }}>Temperature History</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={tempData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                    <XAxis dataKey="index" stroke={theme.textSecondary} />
                    <YAxis domain={[35, 42]} stroke={theme.textSecondary} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="temp" stroke="#F97316" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={styles.card}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px' }}>Heart Rate History</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={hrData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                    <XAxis dataKey="index" stroke={theme.textSecondary} />
                    <YAxis domain={[50, 200]} stroke={theme.textSecondary} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="hr" stroke="#EF4444" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {activeTab === 'movement' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
              <div style={styles.card}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px' }}>Location Heatmap</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                    <XAxis dataKey="lng" stroke={theme.textSecondary} label={{ value: 'Longitude', position: 'bottom' }} />
                    <YAxis dataKey="lat" stroke={theme.textSecondary} label={{ value: 'Latitude', angle: -90, position: 'left' }} />
                    <ZAxis range={[50, 200]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: '8px' }}
                      cursor={{ strokeDasharray: '3 3' }}
                    />
                    <Scatter data={movementData} fill="#3B82F6" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
                <p style={{ ...styles.smallText, marginTop: '12px', textAlign: 'center' }}>
                  Showing last {movementData.length} GPS coordinates
                </p>
              </div>

              <div style={styles.card}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px' }}>Hourly Activity Pattern</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={hourlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                    <XAxis dataKey="hour" stroke={theme.textSecondary} label={{ value: 'Hour of Day', position: 'bottom' }} />
                    <YAxis stroke={theme.textSecondary} label={{ value: 'Activity Count', angle: -90, position: 'left' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: '8px' }}
                    />
                    <Bar dataKey="count" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ ...styles.card, marginTop: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '20px' }}>Movement Statistics</h3>
              <div style={styles.statGrid}>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Total Locations Tracked</p>
                  <p style={{ fontSize: '2rem', fontWeight: '700', marginTop: '8px' }}>{movementData.length}</p>
                </div>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Coverage Area (approx)</p>
                  <p style={{ fontSize: '2rem', fontWeight: '700', marginTop: '8px' }}>
                    {movementData.length > 0 ? '~100m²' : 'N/A'}
                  </p>
                </div>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Most Active Hour</p>
                  <p style={{ fontSize: '2rem', fontWeight: '700', marginTop: '8px' }}>
                    {hourlyActivity.reduce((max, curr) => curr.count > max.count ? curr : max, hourlyActivity[0])?.hour || 'N/A'}:00
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setReportPeriod('daily')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: `2px solid ${reportPeriod === 'daily' ? '#3B82F6' : theme.border}`,
                  backgroundColor: reportPeriod === 'daily' ? '#3B82F6' : theme.cardBg,
                  color: reportPeriod === 'daily' ? 'white' : theme.text,
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Daily Report
              </button>
              <button 
                onClick={() => setReportPeriod('weekly')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: `2px solid ${reportPeriod === 'weekly' ? '#3B82F6' : theme.border}`,
                  backgroundColor: reportPeriod === 'weekly' ? '#3B82F6' : theme.cardBg,
                  color: reportPeriod === 'weekly' ? 'white' : theme.text,
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Weekly Report
              </button>
            </div>

            <div style={styles.reportCard}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '24px', textAlign: 'center' }}>
                {reportPeriod === 'daily' ? 'Daily' : 'Weekly'} Health Report
              </h2>
              
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <p style={{ ...styles.smallText, marginBottom: '8px' }}>Overall Health Score</p>
                <div style={{
                  ...styles.healthScore,
                  color: healthReport.healthScore >= 80 ? '#10B981' : 
                         healthReport.healthScore >= 60 ? '#F59E0B' : '#EF4444'
                }}>
                  {healthReport.healthScore}
                </div>
                <p style={styles.smallText}>
                  {healthReport.healthScore >= 80 ? 'Excellent Health' :
                   healthReport.healthScore >= 60 ? 'Good Health' :
                   healthReport.healthScore >= 40 ? 'Fair Health' : 'Needs Attention'}
                </p>
              </div>

              <div style={styles.statGrid}>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Total Readings</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '8px' }}>{healthReport.totalReadings}</p>
                </div>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Avg Temperature</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '8px' }}>{healthReport.avgTemp}°C</p>
                  <p style={{ ...styles.smallText, marginTop: '4px' }}>
                    Range: {healthReport.minTemp}°C - {healthReport.maxTemp}°C
                  </p>
                </div>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Avg Heart Rate</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '8px' }}>{healthReport.avgHR} bpm</p>
                  <p style={{ ...styles.smallText, marginTop: '4px' }}>
                    Range: {healthReport.minHR} - {healthReport.maxHR} bpm
                  </p>
                </div>
                <div style={styles.statBox}>
                  <p style={styles.smallText}>Geofence Violations</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '8px', color: healthReport.geofenceViolations > 0 ? '#EF4444' : '#10B981' }}>
                    {healthReport.geofenceViolations}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}