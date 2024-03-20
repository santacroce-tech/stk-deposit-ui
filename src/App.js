import React from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import BatchStaking from './BatchStaking';
import './custom.css';
import Header from './Header';
import Footer from './Footer';

function App() {
  return (
    <div className="App">
      <header className="header">
        <Header />
      </header>

      <main className="main-content">
        <BatchStaking />
      </main>
    </div>
  );
}
export default App;
