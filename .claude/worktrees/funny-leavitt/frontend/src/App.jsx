import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './config/web3modal.jsx';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import SwapPage from './pages/SwapPage';
import MarketplacePage from './pages/MarketplacePage';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
      </Routes>
    </BrowserRouter>
  );
}
