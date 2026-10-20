import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Markdown from '@/components/chat2/Markdown'

const emoji = (name: string) => (name === 'moogle' ? 'https://cdn.test/moogle.png' : undefined)

describe('Markdown', () => {
  it('renders inline styles as elements', () => {
    const { container } = render(<Markdown content="**b** *i* __u__ ~~s~~ `c`" />)
    expect(container.querySelector('strong')).toHaveTextContent('b')
    expect(container.querySelector('em')).toHaveTextContent('i')
    expect(container.querySelector('u')).toHaveTextContent('u')
    expect(container.querySelector('del')).toHaveTextContent('s')
    expect(container.querySelector('code')).toHaveTextContent('c')
  })

  it('nests ***__x__***', () => {
    const { container } = render(<Markdown content="***__x__***" />)
    expect(container.querySelector('em > strong > u')).toHaveTextContent('x')
  })

  it('keeps line breaks', () => {
    const { container } = render(<Markdown content={'a\nb'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('renders >>> as one quote and > as one line', () => {
    const { container } = render(<Markdown content={'> one\ntwo\n>>> three\nfour'} />)
    const quotes = container.querySelectorAll('blockquote')
    expect(quotes).toHaveLength(2)
    expect(quotes[0]).toHaveTextContent(/^one$/)
    expect(quotes[1]).toHaveTextContent('threefour')
  })

  it('renders nested and numbered lists', () => {
    const { container } = render(<Markdown content={'- a\n  - b\n1. x\n2. y'} />)
    expect(container.querySelector('ul > li > ul > li')).toHaveTextContent('b')
    expect(container.querySelector('ol')).toHaveAttribute('start', '1')
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
  })

  it('renders headings and -# subtext', () => {
    render(<Markdown content={'# Big\n-# small'} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Big' })).toBeInTheDocument()
    expect(screen.getByText('small').tagName).toBe('SMALL')
  })

  it('reveals a spoiler when toggled, per element', async () => {
    const user = userEvent.setup()
    render(<Markdown content="||one|| ||two||" />)
    const [first, second] = screen.getAllByRole('button', { name: 'Spoiler' })
    expect(first).toHaveAttribute('aria-expanded', 'false')
    await user.click(first)
    expect(screen.getByText('one')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Spoiler' })).toEqual([second])
  })

  it('reveals a spoiler from the keyboard', async () => {
    const user = userEvent.setup()
    render(<Markdown content="||k||" />)
    screen.getByRole('button', { name: 'Spoiler' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Spoiler' })).toBeNull()
    expect(screen.getByText('k')).toBeInTheDocument()
  })

  it('masked links open safely and show the real URL in the title', () => {
    render(<Markdown content="[site](https://example.com/a)" />)
    const a = screen.getByRole('link', { name: 'site' })
    expect(a).toHaveAttribute('href', 'https://example.com/a')
    expect(a).toHaveAttribute('title', 'https://example.com/a')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('a javascript: link becomes text', () => {
    const { container } = render(<Markdown content="[x](javascript:alert(1))" />)
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('[x](javascript:alert(1))')
  })

  it(':moogle: becomes an image, an unknown :name: stays text', () => {
    render(<Markdown content=":moogle: :nope:" emoji={emoji} />)
    const img = screen.getByRole('img', { name: ':moogle:' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/moogle.png')
    expect(screen.getByText(/:nope:/)).toBeInTheDocument()
  })

  it('raw html stays literal text', () => {
    const { container } = render(<Markdown content={'<img src=x onerror="alert(1)">'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">')
  })

  it('an unknown language renders plain monospace with its label', async () => {
    const { container } = render(<Markdown content={'```cobol\nMOVE A TO B\n```'} />)
    expect(container.querySelector('pre code')).toHaveTextContent('MOVE A TO B')
    expect(screen.getByText('cobol')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('pre code .hljs-keyword')).toBeNull()
  })

  it('highlights a known language after the first paint and reports it', async () => {
    const onHighlight = vi.fn()
    const { container } = render(<Markdown content={'```js\nconst a = 1\n```'} onHighlight={onHighlight} />)
    await waitFor(() => expect(container.querySelector('pre code .hljs-keyword')).toHaveTextContent('const'))
    expect(onHighlight).toHaveBeenCalled()
  })

  it('the copy button copies the code', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Markdown content={'```\nhello\n```'} />)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('a failing clipboard does not throw', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Markdown content={'```\nhello\n```'} />)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(writeText).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })
})
