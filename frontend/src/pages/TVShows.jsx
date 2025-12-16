import React, { useState } from 'react';
import OngoingShows from './OngoingShows';
import PastShows from './PastShows';

function TVShows() {
  const [activeTab, setActiveTab] = useState('ongoing');

  return (
    <div>
      <h1>📺 TV Shows</h1>
      
      {/* Tab Navigation */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #2a2a3e', paddingBottom: '1rem' }}>
          <button
            className={`button ${activeTab === 'ongoing' ? '' : 'button-secondary'}`}
            onClick={() => setActiveTab('ongoing')}
            style={{
              background: activeTab === 'ongoing' ? '#667eea' : 'transparent',
              border: activeTab === 'ongoing' ? '1px solid #667eea' : '1px solid #2a2a3e',
              color: activeTab === 'ongoing' ? '#ffffff' : '#b0b0c0'
            }}
          >
            📡 Ongoing Shows
          </button>
          <button
            className={`button ${activeTab === 'past' ? '' : 'button-secondary'}`}
            onClick={() => setActiveTab('past')}
            style={{
              background: activeTab === 'past' ? '#667eea' : 'transparent',
              border: activeTab === 'past' ? '1px solid #667eea' : '1px solid #2a2a3e',
              color: activeTab === 'past' ? '#ffffff' : '#b0b0c0'
            }}
          >
            📚 Past Shows
          </button>
        </div>
        
        <div style={{ marginTop: '1rem', color: '#b0b0c0', fontSize: '0.875rem' }}>
          {activeTab === 'ongoing' && (
            <p>Track ongoing TV shows and automatically download new episodes as they air.</p>
          )}
          {activeTab === 'past' && (
            <p>Download complete seasons of past TV shows. Prioritizes full season packs when available.</p>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'ongoing' && <OngoingShows />}
      {activeTab === 'past' && <PastShows />}
    </div>
  );
}

export default TVShows;