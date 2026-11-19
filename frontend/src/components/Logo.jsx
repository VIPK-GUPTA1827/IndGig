import React from 'react';
import { Link } from 'react-router-dom';

const Logo = ({ size = 'md', to = '/' }) => {
  const heightMap = {
    sm: 'h-7',
    md: 'h-8 sm:h-9',
    lg: 'h-10 sm:h-11'
  };

  const currentHeight = heightMap[size] || heightMap.md;

  return (
    <Link to={to} className="inline-flex items-center group flex-shrink-0 cursor-pointer select-none">
      <img 
        src="/indgig_logo.png?v=multicolor3" 
        alt="IndGig (IG)" 
        className={`${currentHeight} w-auto object-contain group-hover:scale-105 transition-transform duration-200`}
      />
    </Link>
  );
};

export default Logo;
