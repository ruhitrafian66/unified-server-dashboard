import React, { useState } from 'react';
import OngoingShows from './OngoingShows';
import PastShows from './PastShows';

function TVShows() {
  const [activeTab, setActiveTab] = useState('ongoing');

  return (
    <div>
      <h1>📺 TV Shows</h1>
      
      {/* Mobile-Optimized Tab Navigation */}
      <div className="mobile-tabs">
        <button
          className={`mobile-tab ${activeTab === 'ongoing' ? 'active' : ''}`}
          onClick={() => setActiveTab('ongoing')}
        >
          📡 Ongoing Shows
        </button>
        <button
          className={`mobile-tab ${activeTab === 'past' ? 'active' : ''}`}
          onClick={() => setActiveTab('past')}
        >
          📚 Past Shows
        </button>
      </div>
      
      {/* Tab Description */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.4' }}>
          {activeTab === 'ongoing' && (
            <p>📡 <strong style={{ color: '#667eea' }}>Ongoing Shows:</strong> Track current TV shows and automatically download new episodes as they air with smart scheduling.</p>
          )}
          {activeTab === 'past' && (
            <p>📚 <strong style={{ color: '#667eea' }}>Past Shows:</strong> Download complete seasons of finished shows. Prioritizes high-quality season packs when available.</p>
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