import React, { useState } from 'react';
import OngoingShows from './OngoingShows';
import PastShows from './PastShows';

function TVShows() {
  const [activeTab, setActiveTab] = useState('ongoing');

  return (
    <div className="fade-in">
      {/* Tab Navigation */}
      <div className="mobile-tabs">
        <button
          className={`mobile-tab ${activeTab === 'ongoing' ? 'active' : ''}`}
          onClick={() => setActiveTab('ongoing')}
        >
          <span>📡</span>
          <span>Ongoing</span>
        </button>
        <button
          className={`mobile-tab ${activeTab === 'past' ? 'active' : ''}`}
          onClick={() => setActiveTab('past')}
        >
          <span>📚</span>
          <span>Past Shows</span>
        </button>
      </div>
      
      {/* Tab Description */}
      <div className="card">
        <div style={{ color: '#b0b0c0', fontSize: '0.875rem', lineHeight: '1.4' }}>
          {activeTab === 'ongoing' && (
            <p>📡 <strong style={{ color: '#667eea' }}>Ongoing Shows:</strong> Automatically download new episodes as they air</p>
          )}
          {activeTab === 'past' && (
            <p>📚 <strong style={{ color: '#667eea' }}>Past Shows:</strong> Download complete seasons with quality packs</p>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="slide-up">
        {activeTab === 'ongoing' && <OngoingShows />}
        {activeTab === 'past' && <PastShows />}
      </div>
    </div>
  );
}

export default TVShows;