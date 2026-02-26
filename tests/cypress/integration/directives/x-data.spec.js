import { haveText, html, test } from '../../utils'

test('x-data attribute value is optional',
    html`
        <div x-data>
            <span x-text="'foo'"></span>
        </div>
    `,
    ({ get }) => get('span').should(haveText('foo'))
)

test('x-data can be nested',
    html`
        <div x-data="{ foo: 'bar', bar: 'baz' }">
            <div x-data="{ bar: 'bob' }">
                <h1 x-text="foo"></h1>
                <h2 x-text="bar"></h2>
                <button id="inner" @click="foo = 'bob'; bar = 'lob'">click</button>
            </div>

            <h3 x-text="foo"></h3>
            <h4 x-text="bar"></h4>
            <button id="outer" @click="foo = 'law'; bar = 'blog'">click</button>
        </div>
    `,
    ({ get }) => {
        get('h1').should(haveText('bar'))
        get('h2').should(haveText('bob'))
        get('h3').should(haveText('bar'))
        get('h4').should(haveText('baz'))

        get('button#inner').click()
        get('h1').should(haveText('bob'))
        get('h2').should(haveText('lob'))
        get('h3').should(haveText('bob'))
        get('h4').should(haveText('baz'))

        get('button#outer').click()
        get('h1').should(haveText('law'))
        get('h2').should(haveText('lob'))
        get('h3').should(haveText('law'))
        get('h4').should(haveText('blog'))
    }
)

test('x-data can use attributes from a reusable function',
    html`
        <script>
            window.test = () => {
                return {
                    foo: 'bar'
                }
            }
        </script>
        <div x-data="test()">
            <span x-text="foo"></span>
        </div>
    `,
    ({ get }) => get('span').should(haveText('bar'))
)

test('x-data can use $el',
    html`
        <div x-data="{ text: $el.dataset.text }" data-text="test">
            <span x-text="text"></span>
        </div>
    `,
    ({ get }) => get('span').should(haveText('test'))
)

test('functions in x-data are reactive',
    html`
        <div x-data="{ foo: 'bar', getFoo() {return this.foo}}">
            <span x-text="getFoo()"></span>
            <button x-on:click="foo = 'baz'">click me</button>
        </div>
    `,
    ({ get }) => {
        get('span').should(haveText('bar'))
        get('button').click()
        get('span').should(haveText('baz'))
    }
)

test('functions in x-data have access to proper this context',
    html`
        <div x-data="{ foo: undefined, change() { this.foo = 'baz' }}" x-init="foo = 'bar'">
            <button @click="change()">change</button>
            <span x-text="foo"></span>
        </div>
    `,
    ({ get }) => {
        get('span').should(haveText('bar'))
        get('button').click()
        get('span').should(haveText('baz'))
    }
)

test('x-data works on the html tag',
    [html`
        <div>
            <span x-text="'foo'"></span>
        </div>
    `,
    `
        document.querySelector('html').setAttribute('x-data', '')
    `],
    ({ get }) => {
        get('span').should(haveText('foo'))
    }
)

test('x-data getters have access to parent scope',
    html`
    <div x-data="{ foo: 'bar' }">
        <div x-data="{
            get bob() {
                return this.foo
            }
        }">
            <h1 x-text="bob"></h1>
        </div>
    </div>
    `,
    ({ get }) => get('h1').should(haveText('bar'))
)

test('x-for updates when x-data errors array changes via setAttribute',
    [html`
        <div id="target" x-data="{ errors: [''] }">
            <input type="text">
            <ul>
                <template x-for="error in errors">
                    <li x-text="error"></li>
                </template>
            </ul>
        </div>
    `,
    `
        return new Promise(resolve => {
            document.addEventListener('alpine:initialized', () => {
                const target = document.getElementById('target')
                target.setAttribute('x-data', "{ errors: ['field is required', 'too short'] }")
                setTimeout(resolve, 50)
            })
        })
    `],
    ({ get }) => {
        get('li').should('have.length', 2)
        get('li:nth-of-type(1)').should(haveText('field is required'))
        get('li:nth-of-type(2)').should(haveText('too short'))
    }
)

test('x-data re-initializes after attribute is removed then re-added',
    [html`
        <div id="target" x-data="{ count: 1 }">
            <span x-text="count"></span>
        </div>
    `,
    `
        return new Promise(resolve => {
            document.addEventListener('alpine:initialized', () => {
                const target = document.getElementById('target')
                target.removeAttribute('x-data')
                setTimeout(() => {
                    target.setAttribute('x-data', '{ count: 99 }')
                    setTimeout(resolve, 50)
                }, 50)
            })
        })
    `],
    ({ get }) => {
        get('span').should(haveText('99'))
    }
)

test('x-data setAttribute does not create duplicate scope',
    [html`
        <div id="target" x-data="{ count: 1 }">
            <span x-text="$data.count"></span>
        </div>
    `,
    `
        return new Promise(resolve => {
            document.addEventListener('alpine:initialized', () => {
                document.getElementById('target').setAttribute('x-data', '{ count: 99 }')
                setTimeout(resolve, 50)
            })
        })
    `],
    ({ get }, reload, window) => {
        get('span').should(haveText('99'))
        get('#target').then(([el]) => {
            expect(el._x_dataStack.length).to.equal(1)
        })
    }
)

test('removing child x-data falls back to parent scope',
    [html`
        <div id="parent" x-data="{ name: 'parent', shared: 'from-parent' }">
            <div id="child" x-data="{ shared: 'from-child' }">
                <span id="name" x-text="name"></span>
                <span id="shared" x-text="shared"></span>
            </div>
        </div>
    `,
    `
        return new Promise(resolve => {
            document.addEventListener('alpine:initialized', () => {
                document.getElementById('child').removeAttribute('x-data')
                setTimeout(resolve, 50)
            })
        })
    `],
    ({ get }) => {
        // After child x-data is removed, children inherit parent scope only
        get('#name').should(haveText('parent'))
        get('#shared').should(haveText('from-parent'))
    }
)

test('x-data setAttribute updates server key without resetting client-mutated key',
    [html`
        <div id="target" x-data="{ count: 1, open: false }">
            <span id="count" x-text="count"></span>
            <span id="open" x-text="open"></span>
            <button @click="open = true">open</button>
        </div>
    `,
    `
        return new Promise(resolve => {
            document.addEventListener('alpine:initialized', () => {
                document.querySelector('button').click()
                document.getElementById('target').setAttribute('x-data', '{ count: 99, open: false }')
                setTimeout(resolve, 50)
            })
        })
    `],
    ({ get }) => {
        get('#count').should(haveText('99'))
        get('#open').should(haveText('true'))
    }
)
