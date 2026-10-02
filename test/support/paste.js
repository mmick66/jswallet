/**
 * Clicks into a field and pastes the text, which enters it with one input event: user.type re-renders an antd
 * form and runs its checks once per key, the slowest part of the component tests on a busy machine
 * (jswallet-jwb). For the long values, such as addresses and passwords, that no test checks key by key; the
 * tests about typing, and the amounts that the send form converts as they are typed, keep user.type.
 * @param user The instance from userEvent.setup()
 */
const paste = async (user, element, text) => {
    await user.click(element);
    await user.paste(text);
};

export default paste;
