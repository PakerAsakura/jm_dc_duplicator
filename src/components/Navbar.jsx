import React from 'react'
import img from '../assets/AsakuraLogo.png'
const Navbar = () => {
  return (
    <nav className="bg-pink-800 p-4 flex items-center justify-center h-30 w-full">
      <img src={img} alt="Asakura Logo" className="h-150 w-150" />
    </nav>
  )
}

export default Navbar
