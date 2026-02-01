import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Navbar from './components/Navbar.jsx'
import Duplication from './components/duplication.jsx'

function App() {
  return (
    <>
      <Navbar />
      <Duplication />
    </>
  )
}

export default App
