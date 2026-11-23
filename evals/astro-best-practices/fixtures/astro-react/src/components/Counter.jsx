import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <button onClick={() => setCount(count - 1)}>-</button>
      <output>{count}</output>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}
