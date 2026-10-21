import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('@/app/actions/categories',()=>({quickCreateCategoryAction:create}));
import ProductCategoryField from './ProductCategoryField';
it('selects a group with its full path and automatically derives the umbrella category',()=>{
  const view=render(<ProductCategoryField categories={[{id:'books',name:'Literature'},{id:'other',name:'Other'}]} divisions={[{id:'bibles',name:'Bibles',categoryId:'books',groups:[{id:'study',name:'Study Bibles'}]}]}/>);
  fireEvent.click(screen.getByText('Division and group (optional)'));
  fireEvent.change(screen.getByLabelText('Group'),{target:{value:'study'}});
  expect(screen.getByLabelText('Category')).toHaveValue('books');
  expect(view.container.querySelector('select[name="groupId"]')).toHaveValue('study');
  expect(screen.getByRole('option',{name:'Literature / Bibles / Study Bibles'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Category'),{target:{value:'other'}});
  expect(screen.getByLabelText('Group')).toHaveValue('');
});
it('adds a category inline and preserves the unsaved product fields',async()=>{create.mockResolvedValue({success:true,data:{id:'new',name:'Stationery'}});const view=render(<form><input aria-label="Product name" defaultValue="Exercise book"/><ProductCategoryField categories={[]}/></form>);fireEvent.click(screen.getByRole('button',{name:'+ Add category'}));fireEvent.change(screen.getByLabelText('New category name'),{target:{value:'Stationery'}});fireEvent.click(screen.getByRole('button',{name:'Save category'}));await waitFor(()=>expect(screen.getByRole('combobox')).toHaveValue('new'));expect(screen.getByLabelText('Product name')).toHaveValue('Exercise book');expect(view.container.querySelectorAll('form')).toHaveLength(1);});
it('keeps the form and entered category visible on save failure',async()=>{create.mockResolvedValue({success:false,error:'Try again'});render(<ProductCategoryField categories={[]}/>);fireEvent.click(screen.getByRole('button',{name:'+ Add category'}));fireEvent.change(screen.getByLabelText('New category name'),{target:{value:'New'}});fireEvent.click(screen.getByRole('button',{name:'Save category'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Try again'));expect(screen.getByLabelText('New category name')).toHaveValue('New');});
it('requires a group after a division is chosen and clearly supports returning to category only',()=>{
  render(<ProductCategoryField categories={[{id:'c',name:'Household'}]} defaultValue="c" divisions={[{id:'d',name:'fairytale',categoryId:'c',groups:[{id:'g',name:'Western'}]}]}/>);
  expect(screen.getByLabelText('Division')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Division'),{target:{value:'d'}});
  expect(screen.getByLabelText('Group')).toBeRequired();
  expect((screen.getByLabelText('Group') as HTMLSelectElement).checkValidity()).toBe(false);
  expect(screen.getByRole('status')).toHaveTextContent('Choose a group to finish');
  fireEvent.click(screen.getByRole('button',{name:'Use category only'}));
  expect(screen.getByLabelText('Group')).not.toBeRequired();
  expect(screen.getByText('Household (category only)')).toBeInTheDocument();
});
