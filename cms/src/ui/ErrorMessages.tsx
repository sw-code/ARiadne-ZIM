export function ErrorMessages({ messages }: { messages: string[] }) {
  return (
    <ul role="alert" className="error-messages">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
